import { gererErreur, ok } from '@/lib/api/http';
import { construireStats, periodePrecedente } from '@/lib/analytics';
import { listerTousLeads } from '@/lib/db/leads';
import { lireObjectif, lireReglages } from '@/lib/db/settings';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const periode = new URL(request.url).searchParams.get('periode') ?? lireReglages().periodeActive;
    return ok(
      construireStats({
        leads: listerTousLeads({ periode }),
        leadsPeriodePrecedente: listerTousLeads({ periode: periodePrecedente(periode) }),
        objectif: lireObjectif(periode),
      }),
    );
  } catch (err) {
    return gererErreur(err);
  }
}
