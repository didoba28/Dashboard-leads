/**
 * Sonde de santé — volontairement publique et non authentifiée.
 *
 * Elle ne révèle aucune donnée de lead : seulement de quoi diagnostiquer un
 * déploiement (pilote de base actif, base joignable, intégrations configurées
 * ou non). C'est ce que surveillera un uptime monitor.
 */
import { NextResponse } from 'next/server';
import { getDb, nomDuPilote } from '@/lib/db';
import { notionEstConfigure } from '@/lib/notion/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const debut = Date.now();
  try {
    const db = await getDb();
    const ligne = await db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM leads WHERE deleted_at IS NULL',
    );
    return NextResponse.json({
      statut: 'ok',
      pilote: await nomDuPilote(),
      leads: Number(ligne?.n ?? 0),
      latenceMs: Date.now() - debut,
      integrations: {
        notion: notionEstConfigure(),
        slack: Boolean(process.env['SLACK_SIGNING_SECRET']),
        ingestion: Boolean(process.env['INGEST_TOKEN']),
        cle_api: Boolean(process.env['API_KEY']),
        taches_planifiees: Boolean(process.env['CRON_SECRET']),
      },
      versionNode: process.version,
    });
  } catch (err) {
    return NextResponse.json(
      {
        statut: 'degrade',
        erreur: err instanceof Error ? err.message : String(err),
        latenceMs: Date.now() - debut,
      },
      { status: 503 },
    );
  }
}
