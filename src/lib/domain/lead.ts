/** Modèle de lead, schémas de validation et normalisation. */
import { z } from 'zod';
import {
  INITIATIVES,
  RELATIONS,
  SEGMENTS,
  SOURCES_COLLECTE,
  STATUTS,
  STATUTS_OPPORTUNITE,
  TYPES_ACTIVATION,
  TYPES_DEMANDE,
  type Initiative,
  type Relation,
  type Segment,
  type SourceCollecte,
  type Statut,
  type TypeActivation,
  type TypeDemande,
} from './taxonomy';
import { POINTS_AUTORISES } from './scoring';

export interface Lead {
  id: string;
  /** Date de réception du lead (`YYYY-MM-DD`) — c'est elle qui rattache à une période. */
  dateReception: string;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  societe: string | null;
  fonction: string | null;
  ville: string | null;

  segment: Segment;
  relation: Relation;
  typeDemande: TypeDemande;
  initiative: Initiative;
  sourceCollecte: SourceCollecte;

  /** Nom de la campagne outbound ou de l'édition newsletter, si applicable. */
  campagne: string | null;
  /** Nom du contenu téléchargé (fiche technique X, livre blanc Y…). */
  leadMagnet: string | null;
  message: string | null;

  statut: Statut;
  typeActivation: TypeActivation | null;
  dateActivation: string | null;
  proprietaire: string | null;
  tags: string[];

  // Champs calculés par le moteur de scoring, persistés pour l'agrégation.
  eligible: boolean;
  points: number;
  eligibleActivation: boolean;
  regleId: string;
  regleLabel: string;
  explication: string;

  /** Arbitrage manuel des points (prime sur le calcul automatique). */
  pointsOverride: number | null;
  pointsOverrideRaison: string | null;

  /** Une automatisation propose un score ; seul un utilisateur connecté le confirme. */
  validationRequise: boolean;
  pointsConfirmes: boolean;
  pointsConfirmesLe: string | null;
  pointsConfirmesPar: string | null;

  /** Le lead demande une relecture humaine (classification automatique incertaine). */
  aVerifier: boolean;
  confiance: number | null;

  dedupeKey: string | null;
  notionPageId: string | null;
  notionLastSyncedAt: string | null;
  rawPayload: unknown;

  createdAt: string;
  updatedAt: string;
}

/** Une date calendaire réelle, sans normalisation silencieuse du 31 février. */
export function estDateSimpleValide(valeur: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
  const date = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === valeur;
}

const dateSimple = z
  .string()
  .refine(estDateSimpleValide, 'Date calendaire invalide (format attendu YYYY-MM-DD)');

const texteOptionnel = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

/** Schéma de création/mise à jour d'un lead (entrée API et formulaire). */
export const schemaLeadInput = z.object({
  dateReception: dateSimple.optional(),
  nom: texteOptionnel,
  email: z
    .union([z.string().trim().email('E-mail invalide'), z.literal('')])
    .transform((v) => (v ? v.toLowerCase() : null))
    .nullable()
    .optional(),
  telephone: texteOptionnel,
  societe: texteOptionnel,
  fonction: texteOptionnel,
  ville: texteOptionnel,

  segment: z.enum(SEGMENTS),
  relation: z.enum(RELATIONS).default('prospect'),
  typeDemande: z.enum(TYPES_DEMANDE),
  initiative: z.enum(INITIATIVES).default('inbound_site'),
  sourceCollecte: z.enum(SOURCES_COLLECTE).default('manuel'),

  campagne: texteOptionnel,
  leadMagnet: texteOptionnel,
  message: z
    .string()
    .trim()
    .max(5000)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),

  statut: z.enum(STATUTS).default('nouveau'),
  typeActivation: z.enum(TYPES_ACTIVATION).nullable().optional(),
  dateActivation: dateSimple.nullable().optional(),
  proprietaire: texteOptionnel,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),

  pointsOverride: z
    .number()
    .refine((n) => (POINTS_AUTORISES as readonly number[]).includes(n), {
      message: 'Les points forcés doivent valoir 0, 0,5 ou 1',
    })
    .nullable()
    .optional(),
  pointsOverrideRaison: texteOptionnel,
  aVerifier: z.boolean().optional(),
  confiance: z.number().min(0).max(1).nullable().optional(),
  notionPageId: z.string().trim().nullable().optional(),
  rawPayload: z.unknown().optional(),
});

export type LeadInput = z.input<typeof schemaLeadInput>;
export type LeadParsed = z.output<typeof schemaLeadInput>;

export const schemaLeadPatch = schemaLeadInput.partial();
export type LeadPatch = z.input<typeof schemaLeadPatch>;

/** Un lead compte-t-il comme opportunité activée / réactivée par l'inbound ? */
export function estOpportuniteInbound(lead: Lead): boolean {
  return lead.pointsConfirmes && lead.eligible && lead.eligibleActivation && STATUTS_OPPORTUNITE.includes(lead.statut);
}

/** Score proposé avant confirmation, avec arbitrage manuel éventuel. */
export function pointsProposesDuLead(lead: Lead): number {
  if (!lead.eligible && lead.pointsOverride == null) return 0;
  return lead.pointsOverride ?? lead.points;
}

/** Seuls les points confirmés entrent dans les objectifs et les primes. */
export function pointsDuLead(lead: Lead): number {
  return lead.pointsConfirmes ? pointsProposesDuLead(lead) : 0;
}

/**
 * Clé de déduplication : même personne, indépendamment de l'origine.
 * La fenêtre de dates est appliquée par le dépôt de données. Ainsi, un même
 * e-mail capté par Slack puis par Gmail le même jour ne crée qu'un lead.
 * La ressource demandée ne fait volontairement PAS partie de la clé. En
 * production, un même visiteur remplit couramment le formulaire de contact
 * puis le simulateur à une minute d'intervalle : deux notifications, mais une
 * seule demande entrante. L'inclure dans la clé laissait passer ces doublons.
 */
export function calculerDedupeKey(input: {
  nom?: string | null;
  email?: string | null;
  telephone?: string | null;
  societe?: string | null;
  ville?: string | null;
  sourceCollecte?: string | null;
  typeDemande: string;
  leadMagnet?: string | null;
  dateReception: string;
}): string | null {
  const email = normaliser(input.email);
  const emailTechnique = estEmailTechnique(input.email);
  if (email && !emailTechnique) return email;

  // Les notifications transférées contiennent souvent le téléphone d'un
  // collaborateur AirFit dans la signature. Ne jamais l'utiliser comme identité
  // quand l'e-mail détecté est lui-même une adresse technique.
  const telephone = normaliser(input.telephone);
  if (telephone && !emailTechnique) return telephone;

  const nom = normaliser(input.nom);
  const ville = normaliser(input.ville);
  if (nom && ville) return `nom:${nom}|ville:${ville}`;
  return null;
}

/** Adresses de transport/signature qui ne désignent jamais le prospect. */
export function estEmailTechnique(email: string | null | undefined): boolean {
  const valeur = email?.trim().toLowerCase();
  if (!valeur) return false;
  const [local, domaine] = valeur.split('@');
  return domaine === 'airfit.co' ||
    local === 'no-reply' ||
    local === 'noreply' ||
    valeur === 'no-reply-forms@webflow.com' ||
    valeur === 'form-spam-reports@support.webflow.com';
}

/** Toutes les identités fiables utilisées pour rapprocher deux canaux. */
export function clesIdentiteDedupe(input: {
  nom?: string | null;
  email?: string | null;
  telephone?: string | null;
  ville?: string | null;
}): string[] {
  const cles: string[] = [];
  const emailTechnique = estEmailTechnique(input.email);
  const email = normaliser(input.email);
  const telephone = normaliser(input.telephone);
  const nom = normaliser(input.nom);
  const ville = normaliser(input.ville);

  if (email && !emailTechnique) cles.push(`email:${email}`);
  if (telephone && !emailTechnique) cles.push(`telephone:${telephone}`);
  if (nom && ville) cles.push(`nom-ville:${nom}|${ville}`);
  return cles;
}

function normaliser(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@.+]/g, '');
  return t === '' ? null : t;
}

export function aujourdHui(): string {
  return new Date().toISOString().slice(0, 10);
}
