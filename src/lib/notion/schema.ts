/**
 * Correspondance entre le modèle de lead local et les propriétés Notion.
 *
 * Une seule source de vérité : `PROPRIETES` sert à la fois à créer la base
 * Notion, à vérifier qu'elle est complète, à écrire (`versProprietesNotion`)
 * et à relire (`depuisPageNotion`).
 */
import {
  INITIATIVES,
  LABELS_INITIATIVE,
  LABELS_RELATION,
  LABELS_SEGMENT,
  LABELS_SOURCE_COLLECTE,
  LABELS_STATUT,
  LABELS_TYPE_ACTIVATION,
  LABELS_TYPE_DEMANDE,
  RELATIONS,
  SEGMENTS,
  SOURCES_COLLECTE,
  STATUTS,
  TYPES_ACTIVATION,
  TYPES_DEMANDE,
  type Initiative,
  type Relation,
  type Segment,
  type SourceCollecte,
  type Statut,
  type TypeActivation,
  type TypeDemande,
} from '@/lib/domain/taxonomy';
import { pointsDuLead, type Lead, type LeadParsed } from '@/lib/domain/lead';
import { periodeDepuisDate } from '@/lib/domain/periods';

/** Noms des propriétés Notion (modifiables ici seulement). */
export const P = {
  nom: 'Nom',
  dateReception: 'Date de réception',
  email: 'E-mail',
  telephone: 'Téléphone',
  societe: 'Société',
  fonction: 'Fonction',
  ville: 'Ville',
  segment: 'Segment',
  relation: 'Relation',
  typeDemande: 'Type de demande',
  initiative: 'Initiative',
  sourceCollecte: 'Source',
  campagne: 'Campagne',
  leadMagnet: 'Lead magnet',
  message: 'Message',
  statut: 'Statut',
  typeActivation: "Type d'activation",
  dateActivation: "Date d'activation",
  proprietaire: 'Propriétaire',
  tags: 'Tags',
  points: 'Points',
  pointsOverride: 'Points forcés',
  eligible: 'Lead entrant',
  eligibleActivation: 'Compte en activation',
  regle: 'Règle appliquée',
  aVerifier: 'À vérifier',
  periode: 'Période',
  idDashboard: 'ID Dashboard',
} as const;

const couleurs = ['blue', 'green', 'orange', 'purple', 'pink', 'yellow', 'red', 'brown', 'gray'] as const;

function options(valeurs: readonly string[], labels: Record<string, string>) {
  return valeurs.map((v, i) => ({ name: labels[v] ?? v, color: couleurs[i % couleurs.length]! }));
}

/** Schéma de la base Notion, utilisé à la création et à la vérification. */
export const PROPRIETES: Record<string, Record<string, unknown>> = {
  [P.nom]: { title: {} },
  [P.dateReception]: { date: {} },
  [P.email]: { email: {} },
  [P.telephone]: { phone_number: {} },
  [P.societe]: { rich_text: {} },
  [P.fonction]: { rich_text: {} },
  [P.ville]: { rich_text: {} },
  [P.segment]: { select: { options: options(SEGMENTS, LABELS_SEGMENT) } },
  [P.relation]: { select: { options: options(RELATIONS, LABELS_RELATION) } },
  [P.typeDemande]: { select: { options: options(TYPES_DEMANDE, LABELS_TYPE_DEMANDE) } },
  [P.initiative]: { select: { options: options(INITIATIVES, LABELS_INITIATIVE) } },
  [P.sourceCollecte]: { select: { options: options(SOURCES_COLLECTE, LABELS_SOURCE_COLLECTE) } },
  [P.campagne]: { rich_text: {} },
  [P.leadMagnet]: { rich_text: {} },
  [P.message]: { rich_text: {} },
  [P.statut]: { select: { options: options(STATUTS, LABELS_STATUT) } },
  [P.typeActivation]: { select: { options: options(TYPES_ACTIVATION, LABELS_TYPE_ACTIVATION) } },
  [P.dateActivation]: { date: {} },
  [P.proprietaire]: { rich_text: {} },
  [P.tags]: { multi_select: { options: [] } },
  [P.points]: { number: { format: 'number' } },
  [P.pointsOverride]: { number: { format: 'number' } },
  [P.eligible]: { checkbox: {} },
  [P.eligibleActivation]: { checkbox: {} },
  [P.regle]: { rich_text: {} },
  [P.aVerifier]: { checkbox: {} },
  [P.periode]: { rich_text: {} },
  [P.idDashboard]: { rich_text: {} },
};

// --- Écriture : lead local → propriétés Notion --------------------------------

const texte = (v: string | null | undefined) =>
  v ? { rich_text: [{ type: 'text' as const, text: { content: v.slice(0, 1900) } }] } : { rich_text: [] };

const titre = (v: string | null | undefined) => ({
  title: [{ type: 'text' as const, text: { content: (v && v.trim() !== '' ? v : 'Lead sans nom').slice(0, 1900) } }],
});

const date = (v: string | null | undefined) => (v ? { date: { start: v } } : { date: null });

function selectLabel<T extends string>(valeur: T | null, labels: Record<string, string>) {
  return valeur ? { select: { name: labels[valeur] ?? valeur } } : { select: null };
}

export function versProprietesNotion(lead: Lead): Record<string, unknown> {
  return {
    [P.nom]: titre(lead.nom ?? lead.societe ?? lead.email),
    [P.dateReception]: date(lead.dateReception),
    [P.email]: { email: lead.email },
    [P.telephone]: { phone_number: lead.telephone },
    [P.societe]: texte(lead.societe),
    [P.fonction]: texte(lead.fonction),
    [P.ville]: texte(lead.ville),
    [P.segment]: selectLabel(lead.segment, LABELS_SEGMENT),
    [P.relation]: selectLabel(lead.relation, LABELS_RELATION),
    [P.typeDemande]: selectLabel(lead.typeDemande, LABELS_TYPE_DEMANDE),
    [P.initiative]: selectLabel(lead.initiative, LABELS_INITIATIVE),
    [P.sourceCollecte]: selectLabel(lead.sourceCollecte, LABELS_SOURCE_COLLECTE),
    [P.campagne]: texte(lead.campagne),
    [P.leadMagnet]: texte(lead.leadMagnet),
    [P.message]: texte(lead.message),
    [P.statut]: selectLabel(lead.statut, LABELS_STATUT),
    [P.typeActivation]: selectLabel(lead.typeActivation, LABELS_TYPE_ACTIVATION),
    [P.dateActivation]: date(lead.dateActivation),
    [P.proprietaire]: texte(lead.proprietaire),
    [P.tags]: { multi_select: lead.tags.map((t) => ({ name: t.slice(0, 90) })) },
    [P.points]: { number: pointsDuLead(lead) },
    [P.pointsOverride]: { number: lead.pointsOverride },
    [P.eligible]: { checkbox: lead.eligible },
    [P.eligibleActivation]: { checkbox: lead.pointsConfirmes && lead.eligibleActivation },
    [P.regle]: texte(lead.regleLabel),
    [P.aVerifier]: { checkbox: lead.aVerifier },
    [P.periode]: texte(periodeDepuisDate(lead.dateReception)),
    [P.idDashboard]: texte(lead.id),
  };
}

// --- Lecture : page Notion → patch de lead ------------------------------------

type ValeurNotion = Record<string, unknown> | undefined;

function lireTexte(v: ValeurNotion): string | null {
  const blocs = (v?.['rich_text'] ?? v?.['title']) as Array<{ plain_text?: string }> | undefined;
  if (!Array.isArray(blocs) || blocs.length === 0) return null;
  const t = blocs.map((b) => b.plain_text ?? '').join('').trim();
  return t === '' ? null : t;
}

function lireSelect(v: ValeurNotion): string | null {
  const s = v?.['select'] as { name?: string } | null | undefined;
  return s?.name ?? null;
}

function lireDate(v: ValeurNotion): string | null {
  const d = v?.['date'] as { start?: string } | null | undefined;
  return d?.start ? d.start.slice(0, 10) : null;
}

function lireNombre(v: ValeurNotion): number | null {
  const n = v?.['number'];
  return typeof n === 'number' ? n : null;
}

function lireCase(v: ValeurNotion): boolean {
  return v?.['checkbox'] === true;
}

function lireMulti(v: ValeurNotion): string[] {
  const m = v?.['multi_select'] as Array<{ name?: string }> | undefined;
  return Array.isArray(m) ? m.map((o) => o.name ?? '').filter(Boolean) : [];
}

/** Inverse un dictionnaire de libellés pour retrouver la clé technique. */
function inverse<T extends string>(labels: Record<T, string>): Map<string, T> {
  const m = new Map<string, T>();
  for (const [cle, label] of Object.entries(labels) as Array<[T, string]>) {
    m.set(label.toLowerCase(), cle);
    m.set(cle.toLowerCase(), cle);
  }
  return m;
}

const INV_SEGMENT = inverse(LABELS_SEGMENT);
const INV_RELATION = inverse(LABELS_RELATION);
const INV_TYPE = inverse(LABELS_TYPE_DEMANDE);
const INV_INITIATIVE = inverse(LABELS_INITIATIVE);
const INV_SOURCE = inverse(LABELS_SOURCE_COLLECTE);
const INV_STATUT = inverse(LABELS_STATUT);
const INV_ACTIVATION = inverse(LABELS_TYPE_ACTIVATION);

function resoudre<T extends string>(brut: string | null, index: Map<string, T>, defaut: T): T {
  if (!brut) return defaut;
  return index.get(brut.trim().toLowerCase()) ?? defaut;
}

export interface LeadDepuisNotion {
  patch: Partial<LeadParsed>;
  idDashboard: string | null;
}

/** Convertit une page Notion en patch exploitable côté dashboard. */
export function depuisPageNotion(page: {
  properties: Record<string, unknown>;
}): LeadDepuisNotion {
  const props = page.properties as Record<string, ValeurNotion>;
  const patch: Partial<LeadParsed> = {
    nom: lireTexte(props[P.nom]),
    dateReception: lireDate(props[P.dateReception]) ?? undefined,
    email: (props[P.email]?.['email'] as string | null) ?? null,
    telephone: (props[P.telephone]?.['phone_number'] as string | null) ?? null,
    societe: lireTexte(props[P.societe]),
    fonction: lireTexte(props[P.fonction]),
    ville: lireTexte(props[P.ville]),
    segment: resoudre<Segment>(lireSelect(props[P.segment]), INV_SEGMENT, 'b2b'),
    relation: resoudre<Relation>(lireSelect(props[P.relation]), INV_RELATION, 'prospect'),
    typeDemande: resoudre<TypeDemande>(lireSelect(props[P.typeDemande]), INV_TYPE, 'formulaire_contact'),
    initiative: resoudre<Initiative>(lireSelect(props[P.initiative]), INV_INITIATIVE, 'inbound_site'),
    sourceCollecte: resoudre<SourceCollecte>(lireSelect(props[P.sourceCollecte]), INV_SOURCE, 'notion'),
    campagne: lireTexte(props[P.campagne]),
    leadMagnet: lireTexte(props[P.leadMagnet]),
    message: lireTexte(props[P.message]),
    statut: resoudre<Statut>(lireSelect(props[P.statut]), INV_STATUT, 'nouveau'),
    proprietaire: lireTexte(props[P.proprietaire]),
    tags: lireMulti(props[P.tags]),
    pointsOverride: lireNombre(props[P.pointsOverride]),
    aVerifier: lireCase(props[P.aVerifier]),
  };

  const typeActivationBrut = lireSelect(props[P.typeActivation]);
  patch.typeActivation = typeActivationBrut
    ? resoudre<TypeActivation>(typeActivationBrut, INV_ACTIVATION, 'activation')
    : null;
  patch.dateActivation = lireDate(props[P.dateActivation]);

  // Un « Points forcés » hors barème est ignoré plutôt que de faire échouer le pull.
  if (patch.pointsOverride != null && ![0, 0.5, 1].includes(patch.pointsOverride)) {
    patch.pointsOverride = null;
  }

  return { patch, idDashboard: lireTexte(props[P.idDashboard]) };
}
