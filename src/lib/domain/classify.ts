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
const RE_TEL = /(?:(?:\+33|0033)\s?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}/;

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
  for (const ligne of corps.split(/\r?\n/)) {
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

function contient(texte: string, mots: string[]): string | null {
  for (const mot of mots) {
    if (texte.includes(mot)) return mot;
  }
  return null;
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
  const email =
    (premierChamp(champs, ['email', 'e_mail', 'mail', 'adresse_email', 'courriel']) ??
      RE_EMAIL.exec(entree.expediteur ?? '')?.[0] ??
      RE_EMAIL.exec(brut)?.[0] ??
      null)?.toLowerCase().trim() ?? null;
  const emailValide = email && RE_EMAIL.test(email) ? email : null;

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
  const domaineCollectivite =
    domaine != null &&
    (domaine.endsWith('.gouv.fr') ||
      /^(mairie|ville|cc|ca|cu|ct|agglo|commune)[-.]/.test(domaine) ||
      domaine.includes('mairie') ||
      domaine.includes('agglo'));

  if (motCollectivite || domaineCollectivite) {
    segment = 'collectivite';
    signaux += 2;
    indices.push(
      domaineCollectivite ? `domaine public « ${domaine} »` : `mention « ${motCollectivite} »`,
    );
  } else if (domaine && DOMAINES_GRAND_PUBLIC.has(domaine)) {
    // Un domaine grand public sans société renseignée : particulier probable.
    if (societe) {
      segment = 'b2b';
      signaux += 1;
      indices.push(`domaine grand public mais société renseignée (« ${societe} »)`);
    } else {
      segment = 'b2c';
      signaux += 2;
      indices.push(`adresse grand public « ${domaine} » sans société`);
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
    premierChamp(champs, ['ressource', 'document', 'lead_magnet', 'fichier', 'telechargement']) ??
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

  if (emailValide) signaux += 1;
  else indices.push('aucun e-mail détecté');

  const confiance = Math.min(1, Math.round((signaux / 8) * 100) / 100);

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
