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

const dateSimple = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD');

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
  return lead.eligible && lead.eligibleActivation && STATUTS_OPPORTUNITE.includes(lead.statut);
}

/** Points réellement comptabilisés (override manuel prioritaire). */
export function pointsDuLead(lead: Lead): number {
  if (!lead.eligible && lead.pointsOverride == null) return 0;
  return lead.pointsOverride ?? lead.points;
}

/**
 * Clé de déduplication : même personne + même ressource + même journée.
 * Volontairement tolérante (téléphone ou société si pas d'e-mail).
 */
export function calculerDedupeKey(input: {
  email?: string | null;
  telephone?: string | null;
  societe?: string | null;
  typeDemande: string;
  leadMagnet?: string | null;
  dateReception: string;
}): string | null {
  const identite =
    normaliser(input.email) ?? normaliser(input.telephone) ?? normaliser(input.societe);
  if (!identite) return null;
  const ressource = normaliser(input.leadMagnet) ?? input.typeDemande;
  return `${identite}|${ressource}|${input.dateReception}`;
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
