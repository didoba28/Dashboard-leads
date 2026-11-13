/** Vue d’ensemble : les résultats d’abord, les détails à la demande. */
import Link from 'next/link';
import { construireStats, periodePrecedente } from '@/lib/analytics';
import { listerTousLeads } from '@/lib/db/leads';
import { lireObjectif, lireReglages } from '@/lib/db/settings';
import { estIdPeriodeValide, periodesAutour } from '@/lib/domain/periods';
import { BarresRepartition, GraphiqueHebdo, GraphiqueTrajectoire } from '@/components/charts';
import { formaterEuros, formaterPoints } from '@/lib/format';
import { SelecteurPeriode } from '@/components/selecteur-periode';
import { ActiviteMensuelleEtRecente, ActionsPrioritaires, DerniersLeads, QualiteDonnees } from '@/components/pilotage/cockpit';
import { Tiroir } from '@/components/ui/tiroir';
import { construirePilotage, lienLeads } from '@/lib/domain/pilotage';

export const dynamic = 'force-dynamic';

export default async function PageAccueil({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, reglages] = await Promise.all([searchParams, lireReglages()]);
  const demande = typeof params.periode === 'string' ? params.periode : null;
  const periode = demande && estIdPeriodeValide(demande) ? demande : reglages.periodeActive;
  const precedente = periodePrecedente(periode);
  const projectionLegere = { inclureDetails: false };
  const [leads, leadsPeriodePrecedente, objectif, leadsActivations, leadsActivationsPeriodePrecedente] = await Promise.all([
    listerTousLeads({ periode }, projectionLegere),
    listerTousLeads({ periode: precedente }, projectionLegere),
    lireObjectif(periode),
    listerTousLeads({ periodeActivation: periode }, projectionLegere),
    listerTousLeads({ periodeActivation: precedente }, projectionLegere),
  ]);
  const stats = construireStats({ leads, leadsPeriodePrecedente, objectif, leadsActivations, leadsActivationsPeriodePrecedente });
  const pilotage = construirePilotage({ leads, periode });
  const { kpis, synthese } = stats;
  const chiffres = [
    { titre: 'Leads reçus', valeur: String(kpis.leadsTotal), detail: 'Voir les leads de la période', href: lienLeads(periode) },
    { titre: 'Points validés', valeur: formaterPoints(kpis.points), detail: `Objectif : ${formaterPoints(objectif.ciblePoints)} pts`, href: lienLeads(periode, { pointsConfirmes: true }) },
    { titre: 'Opportunités', valeur: String(kpis.opportunites), detail: `${kpis.activations} activées · ${kpis.reactivations} réactivées`, href: lienLeads('toutes', { periodeActivation: periode, opportunitesInbound: true }) },
    { titre: 'Prime acquise', valeur: formaterEuros(synthese.primeTotale), detail: 'Voir les objectifs et les paliers', href: `/objectifs?periode=${periode}` },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Vue d’ensemble</h1>
        <div className="flex flex-wrap items-center gap-3">
          <SelecteurPeriode periodes={periodesAutour(periode, 5, 2).map((p) => ({ id: p.id, label: p.label }))} actuelle={periode} />
          <Link href={lienLeads(periode)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)]">
            Voir les leads <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
          </Link>
        </div>
      </header>

      <section aria-label="Chiffres clés" className="grid grid-cols-2 overflow-hidden rounded-xl border border-hair bg-surface lg:grid-cols-4">
        {chiffres.map((item, index) => (
          <Link key={item.titre} href={item.href} className="min-w-0 border-b border-r border-hair px-3.5 py-4 transition-colors hover:bg-surface-2 focus-visible:outline-offset-[-3px] sm:px-5 sm:py-5 [&:nth-child(even)]:border-r-0 [&:nth-child(n+3)]:border-b-0 lg:border-b-0 lg:[&:nth-child(2)]:border-r">
            <p className="text-sm font-medium text-ink-2">{item.titre}</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight tabulaire sm:text-3xl ${index === 1 ? 'text-s1' : 'text-ink'}`}>{item.valeur}</p>
            <p className="mt-1 text-xs text-ink-muted">{item.detail}</p>
          </Link>
        ))}
      </section>

      <DerniersLeads pilotage={pilotage} periode={periode} />

      <div className="space-y-3">
        <Tiroir titre="Analyses et qualité des données" chargerALOuverture>
          <div className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
            <ActiviteMensuelleEtRecente pilotage={pilotage} periode={periode} />
            <div className="grid gap-4 lg:grid-cols-2">
              <GraphiqueTrajectoire serie={stats.serie} ciblePoints={objectif.ciblePoints} />
              <GraphiqueHebdo serie={stats.serie} />
              <BarresRepartition titre="Par segment" sousTitre="Points et volume" donnees={stats.parSegment} />
              <BarresRepartition titre="Par initiative" sousTitre="Origine de la demande" donnees={stats.parInitiative} />
              <BarresRepartition titre="Par type de demande" sousTitre="Points et volume" donnees={stats.parTypeDemande} />
              <BarresRepartition titre="Par canal de collecte" sousTitre="Source de la notification" donnees={stats.parSourceCollecte} />
            </div>
            <QualiteDonnees pilotage={pilotage} />
          </div>
        </Tiroir>
        <Tiroir titre="Actions prioritaires" compteur={pilotage.totalActions}>
          <ActionsPrioritaires pilotage={pilotage} periode={periode} />
        </Tiroir>
      </div>
    </div>
  );
}
