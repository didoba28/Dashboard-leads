/** Utilitaires partagés par les routes d'API : réponses, erreurs, filtres. */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { FiltresLeads } from '@/lib/db/leads';
import {
  INITIATIVES,
  RELATIONS,
  SEGMENTS,
  SOURCES_COLLECTE,
  STATUTS,
  type Initiative,
  type Relation,
  type Segment,
  type SourceCollecte,
  type Statut,
  type TypeDemande,
  TYPES_DEMANDE,
} from '@/lib/domain/taxonomy';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function erreur(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ erreur: message, details }, { status });
}

/** Convertit toute exception en réponse HTTP lisible. */
export function gererErreur(err: unknown) {
  if (err instanceof ZodError) {
    return erreur(
      'Données invalides',
      422,
      err.issues.map((i) => ({ champ: i.path.join('.'), message: i.message })),
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/Notion n'est pas configuré|Aucune base Notion/.test(message)) return erreur(message, 409);
  if (/invalide/i.test(message)) return erreur(message, 400);
  console.error('[api]', err);
  return erreur(message, 500);
}

function listeDepuis<T extends string>(
  params: URLSearchParams,
  cle: string,
  valides: readonly T[],
): T[] | undefined {
  const brut = params.getAll(cle).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
  if (brut.length === 0) return undefined;
  const filtres = brut.filter((v): v is T => (valides as readonly string[]).includes(v));
  return filtres.length > 0 ? filtres : undefined;
}

function booleenDepuis(params: URLSearchParams, cle: string): boolean | undefined {
  const v = params.get(cle);
  if (v === null || v === '') return undefined;
  return v === 'true' || v === '1';
}

const TRIS_VALIDES = ['date_desc', 'date_asc', 'points_desc', 'maj_desc'] as const;

/** Construit les filtres de liste de leads à partir de la query string. */
export function filtresDepuisUrl(url: URL): FiltresLeads {
  const p = url.searchParams;
  const tri = p.get('tri');
  return {
    periode: p.get('periode') ?? undefined,
    dateDebut: p.get('dateDebut') ?? undefined,
    dateFin: p.get('dateFin') ?? undefined,
    segment: listeDepuis<Segment>(p, 'segment', SEGMENTS),
    relation: listeDepuis<Relation>(p, 'relation', RELATIONS),
    typeDemande: listeDepuis<TypeDemande>(p, 'typeDemande', TYPES_DEMANDE),
    initiative: listeDepuis<Initiative>(p, 'initiative', INITIATIVES),
    sourceCollecte: listeDepuis<SourceCollecte>(p, 'sourceCollecte', SOURCES_COLLECTE),
    statut: listeDepuis<Statut>(p, 'statut', STATUTS),
    eligible: booleenDepuis(p, 'eligible'),
    aVerifier: booleenDepuis(p, 'aVerifier'),
    proprietaire: p.get('proprietaire') ?? undefined,
    q: p.get('q') ?? undefined,
    tri: TRIS_VALIDES.includes(tri as never) ? (tri as FiltresLeads['tri']) : undefined,
    limite: p.get('limite') ? Number(p.get('limite')) : undefined,
    offset: p.get('offset') ? Number(p.get('offset')) : undefined,
  };
}

/**
 * Vérifie le jeton des endpoints d'ingestion.
 * Si `INGEST_TOKEN` n'est pas défini, l'ingestion est refusée : mieux vaut un
 * endpoint fermé qu'un endpoint public qui pollue les objectifs.
 */
export function verifierJetonIngestion(request: Request): string | null {
  const attendu = process.env.INGEST_TOKEN;
  if (!attendu) return "INGEST_TOKEN n'est pas configuré : l'ingestion est désactivée.";
  const header = request.headers.get('authorization') ?? '';
  const fourni = header.startsWith('Bearer ') ? header.slice(7) : new URL(request.url).searchParams.get('token');
  if (!fourni || !comparaisonConstante(fourni, attendu)) return 'Jeton d’ingestion invalide.';
  return null;
}

/** Comparaison à temps constant, pour ne pas fuiter le jeton par timing. */
function comparaisonConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
