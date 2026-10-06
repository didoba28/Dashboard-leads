/** Page Leads : premier rendu côté serveur, filtres ensuite côté client. */
import { listerLeads, lireLead } from '@/lib/db/leads';
import { lireReglages } from '@/lib/db/settings';
import { periodesAutour } from '@/lib/domain/periods';
import { VueLeads } from '@/components/leads/vue-leads';
import { construireQueryLeads, filtresPourDepot, lireFiltresVue, TAILLE_PAGE_LEADS } from '@/lib/leads-filters';

export const dynamic = 'force-dynamic';

export default async function PageLeads({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { filtres, offset: demandeOffset, leadId } = lireFiltresVue(params);
  const [reglages, resultat, leadInitial] = await Promise.all([
    lireReglages(),
    listerLeads(filtresPourDepot(filtres, demandeOffset)),
    leadId ? lireLead(leadId) : Promise.resolve(null),
  ]);
  const offset = resultat.total === 0 ? 0 : demandeOffset >= resultat.total
    ? Math.floor((resultat.total - 1) / TAILLE_PAGE_LEADS) * TAILLE_PAGE_LEADS : demandeOffset;
  const { leads, total } = offset !== demandeOffset ? await listerLeads(filtresPourDepot(filtres, offset)) : resultat;
  const periode = filtres.periode;

  return (
    <VueLeads
      key={construireQueryLeads(filtres, offset, { leadId })}
      leadsInitiaux={leads}
      totalInitial={total}
      filtresInitiaux={filtres}
      offsetInitial={offset}
      leadInitial={leadInitial}
      leadIntrouvable={Boolean(leadId && !leadInitial)}
      periodes={[{ id: 'toutes', label: 'Toutes périodes' }, ...periodesAutour(periode === 'toutes' ? reglages.periodeActive : periode, 5, 2).map((p) => ({ id: p.id, label: p.label }))]}
    />
  );
}
