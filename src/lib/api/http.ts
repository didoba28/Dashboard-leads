/** Utilitaires partagés par les routes d'API : réponses, erreurs, filtres. */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { schemaFiltresLeads, type FiltresLeads } from '@/lib/db/leads';

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

function listeDepuis(params: URLSearchParams, cle: string): string[] | undefined {
  const brut = params.getAll(cle).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
  return brut.length ? [...new Set(brut)] : undefined;
}

function booleenDepuis(params: URLSearchParams, cle: string): boolean | string | undefined {
  const v = params.get(cle);
  if (v === null || v === '') return undefined;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  // Le schéma renvoie une erreur avec le nom du champ au lieu d'élargir le filtre.
  return v;
}

/** Construit les filtres de liste de leads à partir de la query string. */
export function filtresDepuisUrl(url: URL): FiltresLeads {
  const p = url.searchParams;
  return schemaFiltresLeads.parse({
    periode: p.get('periode') === 'toutes' ? undefined : p.get('periode') || undefined,
    periodeActivation: p.get('periodeActivation') || undefined,
    dateDebut: p.get('dateDebut') || undefined,
    dateFin: p.get('dateFin') || undefined,
    segment: listeDepuis(p, 'segment'),
    relation: listeDepuis(p, 'relation'),
    typeDemande: listeDepuis(p, 'typeDemande'),
    initiative: listeDepuis(p, 'initiative'),
    sourceCollecte: listeDepuis(p, 'sourceCollecte'),
    statut: listeDepuis(p, 'statut'),
    eligible: booleenDepuis(p, 'eligible'),
    aVerifier: booleenDepuis(p, 'aVerifier'),
    pointsConfirmes: booleenDepuis(p, 'pointsConfirmes'),
    pointsExclus: booleenDepuis(p, 'pointsExclus'),
    opportunitesInbound: booleenDepuis(p, 'opportunitesInbound'),
    proprietaire: p.get('proprietaire') ?? undefined,
    q: p.get('q') ?? undefined,
    tri: p.get('tri') || undefined,
    limite: p.get('limite') ? Number(p.get('limite')) : undefined,
    offset: p.get('offset') ? Number(p.get('offset')) : undefined,
  });
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
