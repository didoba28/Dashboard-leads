/**
 * Protection des routes d'API par clé.
 *
 * Portée exacte, à ne pas surinterpréter : cette clé empêche un outil tiers
 * d'interroger l'API sans autorisation. Elle **n'authentifie pas les
 * personnes** — l'interface du dashboard reste accessible à qui a l'URL tant
 * qu'une vraie page de connexion n'est pas ajoutée.
 *
 * Deux façons d'être autorisé :
 * - présenter la clé (`Authorization: Bearer …` ou `?cle=…`) : c'est le chemin
 *   des intégrations (Make, Sheets, un script) ;
 * - être une requête émise par l'interface elle-même. Les navigateurs
 *   renseignent `Sec-Fetch-Site: same-origin`, en-tête interdit à JavaScript :
 *   un autre site ne peut pas le falsifier.
 *
 * Sans `API_KEY` définie, rien n'est exigé — c'est le confort du développement
 * local, et c'est documenté comme tel.
 *
 * Les routes d'ingestion et les tâches planifiées ont leurs propres secrets
 * (`INGEST_TOKEN`, `CRON_SECRET`) et sont donc exclues d'ici.
 */
import { NextResponse, type NextRequest } from 'next/server';

const EXCLUES = ['/api/ingest', '/api/cron', '/api/health'];

export function middleware(request: NextRequest) {
  const chemin = request.nextUrl.pathname;
  if (EXCLUES.some((prefixe) => chemin.startsWith(prefixe))) return NextResponse.next();

  const attendue = process.env['API_KEY'];
  if (!attendue) return NextResponse.next();

  const entete = request.headers.get('authorization') ?? '';
  const fournie = entete.startsWith('Bearer ')
    ? entete.slice(7)
    : request.nextUrl.searchParams.get('cle');
  if (fournie && comparaisonConstante(fournie, attendue)) return NextResponse.next();

  const provenance = request.headers.get('sec-fetch-site');
  if (provenance === 'same-origin' || provenance === 'none') return NextResponse.next();

  return NextResponse.json(
    { erreur: 'Clé d’API requise : ajoutez l’en-tête `Authorization: Bearer <API_KEY>`.' },
    { status: 401 },
  );
}

/** Comparaison à temps constant, pour ne pas fuiter la clé par timing. */
function comparaisonConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: '/api/:path*',
};
