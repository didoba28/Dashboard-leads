/** Page Leads : premier rendu côté serveur, filtres ensuite côté client. */
import { listerLeads, listerTousLeads, retraiterAutomatisationHistorique } from '@/lib/db/leads';
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
  const reglages = await lireReglages();
  const demande = typeof params['periode'] === 'string' ? params['periode'] : null;
  const dateDebut = typeof params['dateDebut'] === 'string' ? params['dateDebut'] : '';
  const dateFin = typeof params['dateFin'] === 'string' ? params['dateFin'] : '';
  // La liste est un registre complet : sans filtre explicite, elle montre toutes les périodes.
  // La vue d’ensemble reste, elle, centrée sur la période active.
  const periode = dateDebut || dateFin
    ? 'toutes'
    : demande === 'toutes' ? 'toutes' : demande && estIdPeriodeValide(demande) ? demande : 'toutes';
  const aVerifier = params['aVerifier'] === 'true';
  const valides = params['valides'] === 'true' || params['pointsConfirmes'] === 'true';
  const aConfirmer = !valides && params['aConfirmer'] === 'true';

  const filtres: FiltresVue = {
    periode,
    dateDebut,
    dateFin,
    q: '',
    segment: '',
    statut: '',
    typeDemande: '',
    initiative: '',
    aVerifier,
    aConfirmer,
    valides,
    tri: 'date_desc',
  };

  // Une première lecture répare les anciens payloads Slack, puis le retraitement
  // idempotent applique les nouvelles règles sans dupliquer ni écraser de données.
  await listerTousLeads();
  await retraiterAutomatisationHistorique();

  const { leads, total } = await listerLeads({
    ...(periode === 'toutes' ? {} : { periode }),
    dateDebut: dateDebut || undefined,
    dateFin: dateFin || undefined,
    aVerifier: aVerifier ? true : undefined,
    pointsConfirmes: valides ? true : aConfirmer ? false : undefined,
    limite: 50,
  });

  return (
    <VueLeads
      leadsInitiaux={leads}
      totalInitial={total}
      filtresInitiaux={filtres}
      periodes={[{ id: 'toutes', label: 'Toutes périodes' }, ...periodesAutour(periode === 'toutes' ? reglages.periodeActive : periode, 5, 2).map((p) => ({ id: p.id, label: p.label }))]}
    />
  );
}
