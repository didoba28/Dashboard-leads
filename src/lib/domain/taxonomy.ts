/**
 * Taxonomie métier du suivi des leads entrants (pôle Growth).
 *
 * Chaque dimension est un `enum` fermé : c'est ce qui permet au moteur de
 * scoring (`scoring.ts`) d'être déterministe et exhaustivement testable.
 */

/** Segment du prospect. `collectivite` = B2G (mairies, CCAS, agglomérations…). */
export const SEGMENTS = ['b2b', 'b2c', 'collectivite'] as const;
export type Segment = (typeof SEGMENTS)[number];

/** Relation commerciale existante avec le compte au moment de la demande. */
export const RELATIONS = ['prospect', 'client', 'distributeur'] as const;
export type Relation = (typeof RELATIONS)[number];

/** Nature de la demande entrante. */
export const TYPES_DEMANDE = [
  'formulaire_contact',
  'demande_prix',
  'fiche_technique',
  'livre_blanc',
  'catalogue',
  'simulateur',
  'appel_entrant',
  'lead_magnet_autre',
  'renouvellement_client',
] as const;
export type TypeDemande = (typeof TYPES_DEMANDE)[number];

/**
 * Initiative à l'origine du lead. C'est la dimension qui arbitre le 0,5 vs 1 :
 * une même ressource poussée en outbound ne vaut pas la même chose qu'en
 * newsletter (initiative 100 % Growth).
 */
export const INITIATIVES = [
  'inbound_site',
  'newsletter',
  'outbound_campagne',
  'outbound_bdr',
  'salon_evenement',
  'reseaux_sociaux',
  'bouche_a_oreille',
  'inconnue',
] as const;
export type Initiative = (typeof INITIATIVES)[number];

/** Canal par lequel l'information nous parvient (collecte, pas attribution). */
export const SOURCES_COLLECTE = [
  'slack_inbound',
  'email_formulaire',
  'site_web',
  'telephone',
  'notion',
  'import',
  'manuel',
] as const;
export type SourceCollecte = (typeof SOURCES_COLLECTE)[number];

/** Étape du lead dans le pipeline de qualification. */
export const STATUTS = [
  'nouveau',
  'a_qualifier',
  'qualifie',
  'active',
  'reactive',
  'non_qualifie',
  'perdu',
] as const;
export type Statut = (typeof STATUTS)[number];

/** Statuts qui matérialisent une opportunité (base des primes activation). */
export const STATUTS_OPPORTUNITE: readonly Statut[] = ['active', 'reactive'];

export const TYPES_ACTIVATION = ['activation', 'reactivation'] as const;
export type TypeActivation = (typeof TYPES_ACTIVATION)[number];

/** Initiatives considérées comme outbound (prospection sortante). */
export const INITIATIVES_OUTBOUND: readonly Initiative[] = ['outbound_campagne', 'outbound_bdr'];

/** Types de demande qui correspondent à un contenu téléchargeable (lead magnet). */
export const TYPES_LEAD_MAGNET: readonly TypeDemande[] = [
  'fiche_technique',
  'livre_blanc',
  'catalogue',
  'simulateur',
  'lead_magnet_autre',
];

// --- Libellés d'affichage (UI + export Notion) --------------------------------

export const LABELS_SEGMENT: Record<Segment, string> = {
  b2b: 'B2B',
  b2c: 'B2C',
  collectivite: 'Collectivité',
};

export const LABELS_RELATION: Record<Relation, string> = {
  prospect: 'Prospect',
  client: 'Client',
  distributeur: 'Distributeur',
};

export const LABELS_TYPE_DEMANDE: Record<TypeDemande, string> = {
  formulaire_contact: 'Formulaire de contact',
  demande_prix: 'Demande de prix',
  fiche_technique: 'Fiche technique',
  livre_blanc: 'Livre blanc',
  catalogue: 'Catalogue',
  simulateur: 'Simulateur',
  appel_entrant: 'Appel entrant (site)',
  lead_magnet_autre: 'Autre lead magnet',
  renouvellement_client: 'Renouvellement client',
};

export const LABELS_INITIATIVE: Record<Initiative, string> = {
  inbound_site: 'Inbound / site web',
  newsletter: 'Newsletter',
  outbound_campagne: 'Outbound — campagne mailing',
  outbound_bdr: 'Outbound — BDR',
  salon_evenement: 'Salon / événement',
  reseaux_sociaux: 'Réseaux sociaux',
  bouche_a_oreille: 'Bouche à oreille',
  inconnue: 'Inconnue',
};

export const LABELS_SOURCE_COLLECTE: Record<SourceCollecte, string> = {
  slack_inbound: 'Slack #inbound',
  email_formulaire: 'E-mail / formulaire',
  site_web: 'Site web',
  telephone: 'Téléphone',
  notion: 'Notion',
  import: 'Import',
  manuel: 'Saisie manuelle',
};

export const LABELS_STATUT: Record<Statut, string> = {
  nouveau: 'Nouveau',
  a_qualifier: 'À qualifier',
  qualifie: 'Qualifié',
  active: 'Activé',
  reactive: 'Réactivé',
  non_qualifie: 'Non qualifié',
  perdu: 'Perdu',
};

export const LABELS_TYPE_ACTIVATION: Record<TypeActivation, string> = {
  activation: 'Activation',
  reactivation: 'Réactivation',
};
