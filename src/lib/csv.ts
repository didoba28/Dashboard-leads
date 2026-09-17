/**
 * Parsing et génération CSV, sans dépendance externe.
 *
 * Le parseur est un automate caractère par caractère (pas de `split`) : c'est
 * la seule façon de gérer correctement les champs quotés contenant des sauts
 * de ligne ou le séparateur lui-même.
 */
import {
  LABELS_INITIATIVE,
  LABELS_RELATION,
  LABELS_SEGMENT,
  LABELS_SOURCE_COLLECTE,
  LABELS_STATUT,
  LABELS_TYPE_DEMANDE,
} from './domain/taxonomy';

// --- Normalisation de texte (comparaisons tolérantes) --------------------------

/** minuscules, sans accents, séparateurs (`_`/`-`) unifiés en espace simple. */
function cleNormalisee(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Détection du séparateur -----------------------------------------------

const SEPARATEURS_CANDIDATS = [';', ',', '\t'] as const;

/** Isole la première ligne « logique » du contenu (respecte les guillemets). */
function extraireLigneBrute(contenu: string): string {
  let dansGuillemets = false;
  for (let i = 0; i < contenu.length; i++) {
    const c = contenu.charAt(i);
    if (c === '"') {
      dansGuillemets = !dansGuillemets;
      continue;
    }
    if (!dansGuillemets && (c === '\n' || c === '\r')) return contenu.slice(0, i);
  }
  return contenu;
}

function compterHorsGuillemets(ligne: string, cible: string): number {
  let n = 0;
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne.charAt(i);
    if (c === '"') {
      dansGuillemets = !dansGuillemets;
      continue;
    }
    if (!dansGuillemets && c === cible) n++;
  }
  return n;
}

/** Compte `,` `;` et tabulation sur la première ligne (hors guillemets) et choisit le plus fréquent. */
function detecterSeparateur(contenu: string): string {
  const premiereLigne = extraireLigneBrute(contenu);
  let meilleur: string = ',';
  let meilleurCompte = -1;
  for (const candidat of SEPARATEURS_CANDIDATS) {
    const compte = compterHorsGuillemets(premiereLigne, candidat);
    if (compte > meilleurCompte) {
      meilleur = candidat;
      meilleurCompte = compte;
    }
  }
  return meilleurCompte > 0 ? meilleur : ',';
}

// --- Parsing -----------------------------------------------------------------

/** Automate caractère par caractère : gère guillemets, `""` échappé, \r\n et \n. */
function tokeniserCsv(contenu: string, separateur: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let champ = '';
  let dansGuillemets = false;
  let i = 0;
  const n = contenu.length;

  while (i < n) {
    const c = contenu.charAt(i);

    if (dansGuillemets) {
      if (c === '"') {
        if (contenu.charAt(i + 1) === '"') {
          champ += '"';
          i += 2;
        } else {
          dansGuillemets = false;
          i += 1;
        }
      } else {
        champ += c;
        i += 1;
      }
      continue;
    }

    if (c === '"') {
      dansGuillemets = true;
      i += 1;
      continue;
    }
    if (c === separateur) {
      row.push(champ);
      champ = '';
      i += 1;
      continue;
    }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && contenu.charAt(i + 1) === '\n') i += 1;
      row.push(champ);
      champ = '';
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    champ += c;
    i += 1;
  }

  // Dernier champ/ligne si le contenu ne se termine pas par un saut de ligne.
  if (champ !== '' || row.length > 0) {
    row.push(champ);
    rows.push(row);
  }

  return rows;
}

export interface OptionsParseCsv {
  separateur?: string;
}

export interface ResultatParseCsv {
  entetes: string[];
  lignes: Record<string, string>[];
}

/** Parse un contenu CSV en en-têtes + lignes. Ignore les lignes entièrement vides. */
export function parserCsv(contenu: string, options?: OptionsParseCsv): ResultatParseCsv {
  const sansBom = contenu.charCodeAt(0) === 0xfeff ? contenu.slice(1) : contenu;
  const separateur = options?.separateur ?? detecterSeparateur(sansBom);

  const rows = tokeniserCsv(sansBom, separateur).filter(
    (r) => !r.every((champ) => champ.trim() === ''),
  );
  if (rows.length === 0) return { entetes: [], lignes: [] };

  const entetesBrutes = rows[0] ?? [];
  const entetes = entetesBrutes.map((e) => e.trim());

  const lignes = rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    entetes.forEach((cle, idx) => {
      obj[cle] = row[idx] ?? '';
    });
    return obj;
  });

  return { entetes, lignes };
}

// --- Génération ----------------------------------------------------------------

const SEPARATEUR_EXPORT = ';';

function echapperChampCsv(valeur: string, separateur: string): string {
  const doitEchapper =
    valeur.includes(separateur) || valeur.includes('"') || valeur.includes('\n') || valeur.includes('\r');
  const echappe = valeur.replace(/"/g, '""');
  return doitEchapper ? `"${echappe}"` : echappe;
}

/** `null`/`undefined` → vide, booléen → oui/non, nombre → notation décimale française. */
function formatterValeurCsv(valeur: unknown, separateur: string): string {
  let texte: string;
  if (valeur === null || valeur === undefined) {
    texte = '';
  } else if (typeof valeur === 'boolean') {
    texte = valeur ? 'oui' : 'non';
  } else if (typeof valeur === 'number') {
    texte = String(valeur).replace('.', ',');
  } else {
    texte = String(valeur);
  }
  return echapperChampCsv(texte, separateur);
}

export interface EnteteExportCsv {
  cle: string;
  label: string;
}

/** Génère un CSV « Excel FR » : séparateur `;`, BOM UTF-8, virgule décimale. */
export function genererCsv(lignes: Record<string, unknown>[], entetes: EnteteExportCsv[]): string {
  const ligneEntetes = entetes.map((e) => echapperChampCsv(e.label, SEPARATEUR_EXPORT)).join(SEPARATEUR_EXPORT);
  const lignesCorps = lignes.map((ligne) =>
    entetes.map((e) => formatterValeurCsv(ligne[e.cle], SEPARATEUR_EXPORT)).join(SEPARATEUR_EXPORT),
  );
  return '﻿' + [ligneEntetes, ...lignesCorps].join('\r\n');
}

// --- Correspondance en-têtes tolérants → champs de `schemaLeadInput` -----------

/** Clés déjà normalisées (`cleNormalisee`) → champ technique de `schemaLeadInput`. */
export const NORMALISATION_ENTETES: Record<string, string> = {
  date: 'dateReception',
  'date de reception': 'dateReception',
  'date reception': 'dateReception',

  nom: 'nom',
  'nom complet': 'nom',
  name: 'nom',

  email: 'email',
  'e mail': 'email',
  mail: 'email',
  courriel: 'email',

  telephone: 'telephone',
  tel: 'telephone',

  societe: 'societe',
  entreprise: 'societe',
  organisation: 'societe',

  fonction: 'fonction',
  ville: 'ville',
  segment: 'segment',
  relation: 'relation',

  type: 'typeDemande',
  'type de demande': 'typeDemande',

  initiative: 'initiative',

  source: 'sourceCollecte',
  'source de collecte': 'sourceCollecte',

  campagne: 'campagne',

  'lead magnet': 'leadMagnet',
  ressource: 'leadMagnet',

  message: 'message',
  statut: 'statut',

  proprietaire: 'proprietaire',
  owner: 'proprietaire',

  tags: 'tags',
};

/** En-tête inconnu → `null`. */
export function normaliserEntete(entete: string): string | null {
  return NORMALISATION_ENTETES[cleNormalisee(entete)] ?? null;
}

/** Retrouve la clé technique d'une valeur saisie en clair (clé elle-même ou libellé). */
export function valeurVersCle(valeur: string, labels: Record<string, string>): string | null {
  const cible = cleNormalisee(valeur);
  if (cible === '') return null;
  for (const [cle, label] of Object.entries(labels)) {
    if (cleNormalisee(cle) === cible || cleNormalisee(label) === cible) return cle;
  }
  return null;
}

// --- Dates -----------------------------------------------------------------

function padDeuxChiffres(n: number): string {
  return String(n).padStart(2, '0');
}

/** Vérifie qu'une date existe réellement (rejette le 32/01/2026, le 31/04/2026, etc.). */
function validerDate(annee: number, mois: number, jour: number): string | null {
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) return null;
  return `${annee}-${padDeuxChiffres(mois)}-${padDeuxChiffres(jour)}`;
}

/** Accepte `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY` et une date ISO complète. */
export function normaliserDate(valeur: string): string | null {
  const v = valeur.trim();
  if (v === '') return null;

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return validerDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (m) return validerDate(Number(m[3]), Number(m[2]), Number(m[1]));

  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
  if (m) return validerDate(Number(m[3]), Number(m[2]), Number(m[1]));

  // Date ISO complète, ex. 2026-10-14T08:00:00.000Z
  m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(v);
  if (m) return validerDate(Number(m[1]), Number(m[2]), Number(m[3]));

  return null;
}

// --- CSV → leads ---------------------------------------------------------------

export interface ErreurLigneCsv {
  ligne: number;
  message: string;
}

export interface ResultatLignesCsv {
  valides: unknown[];
  erreurs: ErreurLigneCsv[];
}

/** Mappe des lignes CSV (en-têtes tolérants) vers des objets prêts pour `schemaLeadInput`. */
export function lignesCsvVersLeads(lignes: Record<string, string>[]): ResultatLignesCsv {
  const valides: unknown[] = [];
  const erreurs: ErreurLigneCsv[] = [];

  lignes.forEach((ligneBrute, index) => {
    // 1 = première ligne de données (les en-têtes ne comptent pas).
    const numeroLigne = index + 1;

    const champs: Record<string, string> = {};
    for (const [entete, valeur] of Object.entries(ligneBrute)) {
      const cle = normaliserEntete(entete);
      if (cle && valeur.trim() !== '') champs[cle] = valeur.trim();
    }

    const segmentBrut = champs['segment'];
    const segment = segmentBrut ? valeurVersCle(segmentBrut, LABELS_SEGMENT) : null;
    if (!segment) {
      erreurs.push({
        ligne: numeroLigne,
        message: `Segment manquant ou non reconnu : "${segmentBrut ?? ''}"`,
      });
      return;
    }

    const typeDemandeBrut = champs['typeDemande'];
    const typeDemande = typeDemandeBrut ? valeurVersCle(typeDemandeBrut, LABELS_TYPE_DEMANDE) : null;
    if (!typeDemande) {
      erreurs.push({
        ligne: numeroLigne,
        message: `Type de demande manquant ou non reconnu : "${typeDemandeBrut ?? ''}"`,
      });
      return;
    }

    const relationBrut = champs['relation'];
    const relation = relationBrut ? (valeurVersCle(relationBrut, LABELS_RELATION) ?? undefined) : undefined;

    const initiativeBrut = champs['initiative'];
    const initiative = initiativeBrut
      ? (valeurVersCle(initiativeBrut, LABELS_INITIATIVE) ?? undefined)
      : undefined;

    const sourceBrut = champs['sourceCollecte'];
    const sourceCollecte = sourceBrut
      ? (valeurVersCle(sourceBrut, LABELS_SOURCE_COLLECTE) ?? undefined)
      : undefined;

    const statutBrut = champs['statut'];
    const statut = statutBrut ? (valeurVersCle(statutBrut, LABELS_STATUT) ?? undefined) : undefined;

    const dateBrute = champs['dateReception'];
    const dateReception = dateBrute ? (normaliserDate(dateBrute) ?? undefined) : undefined;

    const tagsBrut = champs['tags'];
    const tags = tagsBrut
      ? tagsBrut
          .split(/[,|]/)
          .map((t) => t.trim())
          .filter((t) => t !== '')
      : undefined;

    const lead: Record<string, unknown> = {
      segment,
      typeDemande,
      ...(dateReception ? { dateReception } : {}),
      ...(champs['nom'] ? { nom: champs['nom'] } : {}),
      ...(champs['email'] ? { email: champs['email'] } : {}),
      ...(champs['telephone'] ? { telephone: champs['telephone'] } : {}),
      ...(champs['societe'] ? { societe: champs['societe'] } : {}),
      ...(champs['fonction'] ? { fonction: champs['fonction'] } : {}),
      ...(champs['ville'] ? { ville: champs['ville'] } : {}),
      ...(relation ? { relation } : {}),
      ...(initiative ? { initiative } : {}),
      ...(sourceCollecte ? { sourceCollecte } : {}),
      ...(champs['campagne'] ? { campagne: champs['campagne'] } : {}),
      ...(champs['leadMagnet'] ? { leadMagnet: champs['leadMagnet'] } : {}),
      ...(champs['message'] ? { message: champs['message'] } : {}),
      ...(statut ? { statut } : {}),
      ...(champs['proprietaire'] ? { proprietaire: champs['proprietaire'] } : {}),
      ...(tags ? { tags } : {}),
    };

    valides.push(lead);
  });

  return { valides, erreurs };
}
