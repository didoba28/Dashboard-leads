/** Objectifs trimestriels, paliers et simulation des primes. */
import { calculerKpis } from '@/lib/analytics';
import { listerTousLeads } from '@/lib/db/leads';
import { lireObjectif, lireReglages } from '@/lib/db/settings';
import { construirePeriode, estIdPeriodeValide, periodesAutour } from '@/lib/domain/periods';
import { EditeurObjectif } from '@/components/objectifs/editeur-objectif';
import { SelecteurPeriode } from '@/components/selecteur-periode';

export const dynamic = 'force-dynamic';

export default async function PageObjectifs({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const reglages = await lireReglages();
  const demande = typeof params['periode'] === 'string' ? params['periode'] : null;
  const periode = demande && estIdPeriodeValide(demande) ? demande : reglages.periodeActive;
  const [leads, activations, objectif] = await Promise.all([
    listerTousLeads({ periode }, { inclureDetails: false }),
    listerTousLeads({ periodeActivation: periode }, { inclureDetails: false }),
    lireObjectif(periode),
  ]);
  const kpis = calculerKpis(leads, activations, construirePeriode(periode));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Objectifs & primes</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {construirePeriode(periode).label} · points par réception, opportunités par date d’activation
          </p>
        </div>
        <SelecteurPeriode
          periodes={periodesAutour(periode, 5, 4).map((p) => ({ id: p.id, label: p.label }))}
          actuelle={periode}
        />
      </header>

      <EditeurObjectif
        objectifInitial={objectif}
        pointsReels={kpis.points}
        opportunitesReelles={kpis.opportunites}
      />
    </div>
  );
}
