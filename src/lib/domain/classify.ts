/**
 * Classification automatique d'un lead à partir d'un texte brut
 * (message Slack #inbound, e-mail de notification de formulaire, etc.).
 *
 * L'objectif n'est pas de deviner à tout prix : quand les signaux sont faibles,
 * la fonction baisse la confiance et le lead est marqué « à vérifier » pour
 * qu'un humain tranche. Aucun lead n'est scoré sur une supposition silencieuse.
 */
import type {
  Initiative,
  Relation,
  Segment,
  TypeDemande,
} from './taxonomy';

export interface EntreeClassification {
  /** Objet de l'e-mail ou première ligne du message Slack. */
  sujet?: string | null;
  /** Expéditeur (`Jean Dupont <jean@mairie-lyon.fr>`), si connu. */
  expediteur?: string | null;
  /** Corps du message. */
  corps?: string | null;
  /** URL de la page d'origine (pour lire les UTM). */
  url?: string | null;
}

export interface ResultatClassification {
  segment: Segment;
  relation: Relation;
  typeDemande: TypeDemande;
  initiative: Initiative;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  societe: string | null;
  ville: string | null;
  campagne: string | null;
  leadMagnet: string | null;
  /** Confiance globale entre 0 et 1. En dessous de 0,6 → relecture humaine. */
  confiance: number;
  /** Signaux ayant servi à la décision (affichés dans l'UI). */
  indices: string[];
  /** Champs extraits ligne à ligne (`Nom : …`), conservés pour audit. */
  champs: Record<string, string>;
}

/** Seuil en dessous duquel un lead est marqué « à vérifier ». */
export const SEUIL_CONFIANCE = 0.6;

const DOMAINES_GRAND_PUBLIC = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.fr', 'yahoo.com', 'hotmail.fr', 'hotmail.com',
  'outlook.fr', 'outlook.com', 'live.fr', 'msn.com', 'orange.fr', 'wanadoo.fr',
  'free.fr', 'sfr.fr', 'laposte.net', 'icloud.com', 'me.com', 'bbox.fr',
  'numericable.fr', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.fr', 'neuf.fr',
]);

const MOTS_COLLECTIVITE = [
  'mairie', 'commune', 'ccas', 'communaute de communes', 'communaute d agglomeration',
  'agglomeration', 'agglo', 'metropole', 'conseil departemental', 'conseil regional',
  'departement', 'region', 'syndicat intercommunal', 'epci', 'collectivite',
  'ville de', 'service des sports', 'service technique', 'etablissement public',
  'college', 'lycee', 'bailleur social',
  // Formulations vues en production, sans ambiguïté côté entreprise.
  'hotel de ville', 'conseil municipal', 'services techniques',
];

const MOTS_ASSOCIATION = [
  'association', 'asso ', 'club sportif', 'club de sport', 'federation',
  'fondation', 'organisme sans but lucratif', 'loi 1901',
];

const MOTS_DISTRIBUTEUR = ['distributeur', 'revendeur', 'grossiste', 'dealer', 'reseau de distribution'];
const MOTS_CLIENT = ['renouvellement', 'deja client', 'notre commande', 'sav', 'apres-vente'];

/** Chaque entrée : mots-clés → type de demande, du plus spécifique au plus générique. */
const REGLES_TYPE: Array<{ type: TypeDemande; mots: string[] }> = [
  { type: 'renouvellement_client', mots: ['renouvellement', 'reconduction', 'renouveler mon contrat'] },
  { type: 'fiche_technique', mots: ['fiche technique', 'fiche produit', 'notice technique', 'datasheet'] },
  { type: 'livre_blanc', mots: ['livre blanc', 'white paper', 'ebook', 'guide pratique'] },
  { type: 'catalogue', mots: ['catalogue', 'brochure'] },
  { type: 'simulateur', mots: ['simulateur', 'simulation', 'estimation en ligne', 'configurateur'] },
  { type: 'demande_prix', mots: ['devis', 'tarif', 'prix', 'budget', 'chiffrage', 'quotation'] },
  { type: 'appel_entrant', mots: ['appel entrant', 'appel telephonique', 'rappel telephonique', 'a rappele'] },
  { type: 'formulaire_contact', mots: ['formulaire', 'demande de contact', 'nous contacter', 'prise de contact'] },
];

const REGLES_INITIATIVE: Array<{ initiative: Initiative; mots: string[] }> = [
  { initiative: 'newsletter', mots: ['newsletter', 'nl growth', 'infolettre'] },
  { initiative: 'outbound_bdr', mots: ['bdr', 'sdr', 'prospection telephonique', 'cold call'] },
  {
    initiative: 'outbound_campagne',
    mots: ['outbound', 'campagne mailing', 'cold email', 'lemlist', 'lagrowthmachine', 'sequence de prospection'],
  },
  { initiative: 'salon_evenement', mots: ['salon', 'congres', 'evenement', 'stand'] },
  { initiative: 'reseaux_sociaux', mots: ['linkedin', 'facebook', 'instagram', 'youtube'] },
  { initiative: 'bouche_a_oreille', mots: ['recommande par', 'bouche a oreille', 'recommandation'] },
];

const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const RE_EMAIL_GLOBAL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const RE_TEL = /(?:(?:\+|00)[1-9]\d{0,2}(?:[\s.-]?\d){7,12}|0[1-9](?:[\s.-]?\d{2}){4})/;

/** Normalise pour la recherche : minuscules, sans accents, espaces compactés. */
export function normaliserTexte(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrait les paires `Clé : valeur` d'un corps de mail de formulaire. */
export function extraireChamps(corps: string): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const ligneBrute of corps.split(/\r?\n/)) {
    const ligne = ligneBrute.replace(/\*\*([^*]+):\*\*/g, '$1:');
    const m = /^\s*\*?\*?([A-Za-zÀ-ÿ' _-]{2,40})\*?\*?\s*[:：]\s*(.+?)\s*$/.exec(ligne);
    if (!m) continue;
    const cle = normaliserTexte(m[1]!).replace(/\s+/g, '_');
    const valeur = m[2]!.replace(/^\*+|\*+$/g, '').trim();
    if (valeur && valeur.length <= 300 && !champs[cle]) champs[cle] = valeur;
  }
  return champs;
}

function premierChamp(champs: Record<string, string>, cles: string[]): string | null {
  for (const cle of cles) {
    const v = champs[cle];
    if (v) return v;
  }
  return null;
}

/**
 * Un mot de 3 lettres ou moins (`sav`, `bdr`, `sdr`) doit être isolé : sinon
 * `sav` se retrouve dans `saintsavin-isere.fr` et classe la commune en client.
 */
function contient(texte: string, mots: string[]): string | null {
  for (const mot of mots) {
    const motif = mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const debut = /^[\p{L}\p{N}]/u.test(mot) ? '(?<![\\p{L}\\p{N}])' : '';
    const fin = /[\p{L}\p{N}]$/u.test(mot) ? '(?![\\p{L}\\p{N}])' : '';
    if (new RegExp(`${debut}${motif}${fin}`, 'u').test(texte)) return mot;
  }
  return null;
}

/** Réduit à `a-z0-9` (minuscules, sans accents ni ponctuation) pour comparer noms et domaines. */
function compacter(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Sous-domaines de second niveau qui précèdent le vrai TLD (`exemple.asso.fr`). */
const SECONDS_NIVEAUX = new Set(['co', 'com', 'org', 'asso', 'gouv', 'net']);

/** Label principal d'un domaine : la partie juste avant le TLD (`doudeville` pour `doudeville.fr`). */
function labelPrincipal(domaine: string): string {
  const parts = domaine.toLowerCase().trim().split('.').filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  const avantTld = parts[parts.length - 2]!;
  if (parts.length >= 3 && SECONDS_NIVEAUX.has(avantTld)) return parts[parts.length - 3]!;
  return avantTld;
}

/** Longueur minimale du plus court des deux noms pour accepter une inclusion. */
const LONGUEUR_MIN_INCLUSION = 6;

/**
 * Le domaine de l'e-mail évoque-t-il la commune renseignée ? C'est le signal
 * fiable pour repérer une mairie dont le domaine ne dit pas « mairie »
 * (`doudeville.fr`, `saintsavin-isere.fr`) : on ne se fie jamais au seul
 * préfixe `saint…` ou `ville…`, qui toucherait des entreprises.
 *
 * Après normalisation (`a-z0-9`), le label principal et la ville se recouvrent
 * si l'un contient l'autre (ce qui couvre le cas « l'un est préfixe de l'autre »)
 * et que le plus court fait au moins 6 caractères, ou s'ils sont strictement
 * égaux (communes courtes : `metz.fr`). Le plancher écarte les labels génériques
 * (`saint`, `paris` dans `paris-fitness.fr`). Un domaine grand public ne compte jamais.
 */
export function domaineEvoqueUneCommune(domaine: string, ville: string | null): boolean {
  if (!ville) return false;
  const domaineNormalise = domaine.toLowerCase().trim();
  if (DOMAINES_GRAND_PUBLIC.has(domaineNormalise)) return false;
  const label = compacter(labelPrincipal(domaineNormalise));
  const nomVille = compacter(ville);
  if (label.length < 3 || nomVille.length < 3) return false;
  if (label === nomVille) return true;
  const [court, long] = label.length <= nomVille.length ? [label, nomVille] : [nomVille, label];
  return court.length >= LONGUEUR_MIN_INCLUSION && long.includes(court);
}

function lireUtm(url: string | null | undefined): Record<string, string> {
  if (!url) return {};
  try {
    const u = new URL(url);
    const out: Record<string, string> = {};
    for (const [k, v] of u.searchParams) {
      if (k.toLowerCase().startsWith('utm_')) out[k.toLowerCase()] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function emailsDans(texte: string | null | undefined): string[] {
  if (!texte) return [];
  return [...texte.matchAll(RE_EMAIL_GLOBAL)].map((match) => match[0]!.toLowerCase().trim());
}

function emailExterne(candidats: Array<string | null | undefined>): string | null {
  const emails = candidats.flatMap(emailsDans);
  return emails.find((email) => !email.endsWith('@airfit.co')) ?? null;
}

export function classifier(entree: EntreeClassification): ResultatClassification {
  const corps = entree.corps ?? '';
  const brut = [entree.sujet ?? '', entree.expediteur ?? '', corps, entree.url ?? '']
    .filter(Boolean)
    .join('\n');
  const texte = normaliserTexte(brut);
  const champs = extraireChamps(corps);
  const utm = lireUtm(entree.url);
  const indices: string[] = [];
  let signaux = 0;

  // --- Identité --------------------------------------------------------------
  const emailChamp = premierChamp(champs, ['email', 'e_mail', 'mail', 'adresse_email', 'courriel']);
  // Le corps du formulaire prime sur l'expéditeur : un transfert envoyé par
  // @airfit.co contient souvent la véritable adresse du prospect plus bas.
  const emailValide = emailExterne([emailChamp, corps, entree.sujet, entree.expediteur]);
  const contientSeulementEmailInterne = !emailValide && emailsDans(brut).some((email) => email.endsWith('@airfit.co'));
  if (contientSeulementEmailInterne) {
    indices.push('adresse interne @airfit.co ignorée');
  }

  const telephone =
    premierChamp(champs, ['telephone', 'tel', 'portable', 'mobile', 'numero']) ??
    RE_TEL.exec(brut)?.[0] ??
    null;

  const nomChamp = premierChamp(champs, ['nom', 'nom_complet', 'nom_et_prenom', 'name']);
  const prenomChamp = premierChamp(champs, ['prenom', 'first_name']);
  let nom = nomChamp;
  if (prenomChamp) nom = nomChamp ? `${prenomChamp} ${nomChamp}` : prenomChamp;
  if (!nom && entree.expediteur) {
    const m = /^\s*"?([^"<]+?)"?\s*</.exec(entree.expediteur);
    if (m && !RE_EMAIL.test(m[1]!)) nom = m[1]!.trim();
  }

  const societe = premierChamp(champs, [
    'societe', 'entreprise', 'organisation', 'organisme', 'collectivite',
    'structure', 'company', 'raison_sociale', 'mairie',
  ]);
  const ville = premierChamp(champs, ['ville', 'commune', 'localite', 'city']);

  // --- Segment ---------------------------------------------------------------
  let segment: Segment = 'b2b';
  const domaine = emailValide?.split('@')[1] ?? null;
  const motCollectivite = contient(texte, MOTS_COLLECTIVITE);
  const motAssociation = contient(texte, MOTS_ASSOCIATION);
  const domaineCollectivite =
    domaine != null &&
    (domaine.endsWith('.gouv.fr') ||
      /^(mairie|ville|cc|ca|cu|ct|agglo|commune)[-.]/.test(domaine) ||
      domaine.includes('mairie') ||
      domaine.includes('agglo'));

  // Domaine de commune sans mot-clé (`doudeville.fr`) : seule la correspondance
  // avec la ville renseignée est assez fiable pour conclure.
  const domaineCommunal = domaine != null && domaineEvoqueUneCommune(domaine, ville);

  if (motAssociation) {
    segment = 'association';
    signaux += 2;
    indices.push(`mention « ${motAssociation} » → association`);
  } else if (motCollectivite || domaineCollectivite || domaineCommunal) {
    segment = 'collectivite';
    signaux += 2;
    if (domaineCollectivite) indices.push(`domaine public « ${domaine} »`);
    else if (domaineCommunal) {
      indices.push(`domaine communal « ${domaine} » correspondant à la ville`);
    } else indices.push(`mention « ${motCollectivite} »`);
  } else if (domaine && DOMAINES_GRAND_PUBLIC.has(domaine)) {
    // Gmail/Orange/etc. sont aussi utilisés par des élus, associations et TPE :
    // sans autre signal, ne jamais transformer silencieusement le lead en B2C.
    if (societe) {
      segment = 'b2b';
      signaux += 1;
      indices.push(`domaine grand public mais société renseignée (« ${societe} »)`);
    } else {
      segment = 'b2b';
      indices.push(`domaine grand public « ${domaine} » — segment à confirmer`);
    }
  } else if (domaine) {
    segment = 'b2b';
    signaux += 2;
    indices.push(`domaine professionnel « ${domaine} »`);
  } else if (societe) {
    segment = 'b2b';
    signaux += 1;
    indices.push(`société renseignée (« ${societe} »)`);
  } else {
    indices.push('segment indéterminé — B2B par défaut');
  }

  // --- Relation --------------------------------------------------------------
  let relation: Relation = 'prospect';
  const motDistributeur = contient(texte, MOTS_DISTRIBUTEUR);
  const motClient = contient(texte, MOTS_CLIENT);
  if (motDistributeur) {
    relation = 'distributeur';
    signaux += 2;
    indices.push(`mention « ${motDistributeur} » → distributeur`);
  } else if (motClient) {
    relation = 'client';
    signaux += 2;
    indices.push(`mention « ${motClient} » → client existant`);
  }

  // --- Type de demande -------------------------------------------------------
  let typeDemande: TypeDemande = 'formulaire_contact';
  let leadMagnet: string | null =
    premierChamp(champs, ['ressource', 'document', 'lead_magnet', 'fichier', 'telechargement', 'origine', 'source']) ??
    null;
  let typeTrouve = false;
  for (const regle of REGLES_TYPE) {
    const mot = contient(texte, regle.mots);
    if (mot) {
      typeDemande = regle.type;
      typeTrouve = true;
      signaux += 2;
      indices.push(`mention « ${mot} » → ${regle.type}`);
      if (!leadMagnet && regle.type !== 'formulaire_contact' && regle.type !== 'demande_prix') {
        leadMagnet = entree.sujet?.trim() || mot;
      }
      break;
    }
  }
  if (!typeTrouve) indices.push('type de demande indéterminé — formulaire de contact par défaut');

  // --- Initiative ------------------------------------------------------------
  let initiative: Initiative = 'inbound_site';
  let campagne: string | null = utm['utm_campaign'] ?? premierChamp(champs, ['campagne', 'campaign']) ?? null;
  const source = (utm['utm_source'] ?? '').toLowerCase();
  const medium = (utm['utm_medium'] ?? '').toLowerCase();

  if (source.includes('newsletter') || medium.includes('newsletter')) {
    initiative = 'newsletter';
    signaux += 2;
    indices.push(`utm_source=${source || medium} → newsletter`);
  } else if (['outbound', 'coldmail', 'prospection', 'lemlist', 'bdr'].some((s) => source.includes(s) || medium.includes(s))) {
    initiative = source.includes('bdr') || medium.includes('bdr') ? 'outbound_bdr' : 'outbound_campagne';
    signaux += 2;
    indices.push(`utm « ${source || medium} » → outbound`);
  } else {
    for (const regle of REGLES_INITIATIVE) {
      const mot = contient(texte, regle.mots);
      if (mot) {
        initiative = regle.initiative;
        signaux += 2;
        indices.push(`mention « ${mot} » → ${regle.initiative}`);
        break;
      }
    }
  }

  const marqueurInbound = contient(texte, [
    'nouveau lead airfit',
    'nouveau contact airfit',
    'nouveau lead entrant',
    'nouveau message du formulaire',
    'new form submission',
  ]);
  if (marqueurInbound) {
    signaux += 2;
    indices.push(`notification structurée « ${marqueurInbound} »`);
  }

  if (emailValide) signaux += 1;
  else indices.push('aucun e-mail détecté');
  if (telephone) signaux += 1;
  if (nom) signaux += 1;

  const confianceCalculee = Math.min(1, Math.round((signaux / 8) * 100) / 100);
  // Même si les autres champs sont complets, un formulaire rempli avec une
  // adresse AirFit reste non légitime et doit passer par une confirmation.
  const confiance = contientSeulementEmailInterne ? Math.min(0.59, confianceCalculee) : confianceCalculee;

  return {
    segment,
    relation,
    typeDemande,
    initiative,
    nom: nom?.slice(0, 120) ?? null,
    email: emailValide,
    telephone: telephone?.slice(0, 40) ?? null,
    societe: societe?.slice(0, 160) ?? null,
    ville: ville?.slice(0, 120) ?? null,
    campagne: campagne?.slice(0, 160) ?? null,
    leadMagnet: leadMagnet?.slice(0, 200) ?? null,
    confiance,
    indices,
    champs,
  };
}
