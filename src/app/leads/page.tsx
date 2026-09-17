/** Page Leads : premier rendu côté serveur, filtres ensuite côté client. */
import { listerLeads } from '@/lib/db/leads';
import { lireReglages } from '@/lib/db/settings';
import { estIdPeriodeValide, periodesAutour } from '@/lib/domain/periods';
import { VueLeads, type FiltresVue } from '@/components/leads/vue-leads';

export const dynamic = 'force-dynamic';

export default async function PageLeads({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const reglages = lireReglages();
  const demande = typeof params['periode'] === 'string' ? params['periode'] : null;
  const periode = demande && estIdPeriodeValide(demande) ? demande : reglages.periodeActive;
  const aVerifier = params['aVerifier'] === 'true';

  const filtres: FiltresVue = {
    periode,
    q: '',
    segment: '',
    statut: '',
    typeDemande: '',
    initiative: '',
    aVerifier,
    tri: 'date_desc',
  };

  const { leads, total } = listerLeads({ periode, aVerifier: aVerifier ? true : undefined, limite: 50 });

  return (
    <VueLeads
      leadsInitiaux={leads}
      totalInitial={total}
      filtresInitiaux={filtres}
      periodes={periodesAutour(periode, 5, 2).map((p) => ({ id: p.id, label: p.label }))}
    />
  );
}
