import { gererErreur, ok } from '@/lib/api/http';
import { construireStats, periodePrecedente } from '@/lib/analytics';
import { listerTousLeads } from '@/lib/db/leads';
import { lireObjectif, lireReglages } from '@/lib/db/settings';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const periode = new URL(request.url).searchParams.get('periode') ?? (await lireReglages()).periodeActive;
    const [leads, leadsPeriodePrecedente, leadsActivations, leadsActivationsPeriodePrecedente, objectif] = await Promise.all([
      listerTousLeads({ periode }, { inclureDetails: false }),
      listerTousLeads({ periode: periodePrecedente(periode) }, { inclureDetails: false }),
      listerTousLeads({ periodeActivation: periode }, { inclureDetails: false }),
      listerTousLeads({ periodeActivation: periodePrecedente(periode) }, { inclureDetails: false }),
      lireObjectif(periode),
    ]);
    return ok(construireStats({ leads, leadsPeriodePrecedente, leadsActivations, leadsActivationsPeriodePrecedente, objectif }));
  } catch (err) {
    return gererErreur(err);
  }
}
