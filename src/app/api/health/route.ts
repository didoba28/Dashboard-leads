/**
 * Sonde de santé — volontairement publique et non authentifiée.
 *
 * Elle ne révèle aucune donnée de lead : seulement de quoi diagnostiquer un
 * déploiement (pilote de base actif, base joignable, intégrations configurées
 * ou non). C'est ce que surveillera un uptime monitor.
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    await db.get('SELECT 1 FROM leads LIMIT 1');
    return NextResponse.json({ statut: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (erreur) {
    const diagnostic = erreur as { name?: string; code?: string; cause?: { code?: string } };
    console.error('[health] Base indisponible', {
      type: diagnostic.name,
      code: diagnostic.code ?? diagnostic.cause?.code,
    });
    return NextResponse.json({ statut: 'degrade' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
