import { gererErreur, ok } from '@/lib/api/http';
import { construireStats, periodePrecedente } from '@/lib/analytics';
import { listerTousLeads } from '@/lib/db/leads';
import { lireObjectif, lireReglages } from '@/lib/db/settings';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const periode = new URL(request.url).searchParams.get('periode') ?? (await lireReglages()).periodeActive;
    const [leads, leadsPeriodePrecedente, objectif] = await Promise.all([
      listerTousLeads({ periode }),
      listerTousLeads({ periode: periodePrecedente(periode) }),
      lireObjectif(periode),
    ]);
    return ok(construireStats({ leads, leadsPeriodePrecedente, objectif }));
  } catch (err) {
    return gererErreur(err);
  }
}
