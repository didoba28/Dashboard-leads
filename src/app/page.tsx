/** Vue d'ensemble : où en est le trimestre, et ce qu'il reste à faire. */
import { construireStats, periodePrecedente } from '@/lib/analytics';
import { listerTousLeads } from '@/lib/db/leads';
import { lireObjectif, lireReglages } from '@/lib/db/settings';
import { estIdPeriodeValide, periodesAutour } from '@/lib/domain/periods';
import { BarresRepartition, Entonnoir, GraphiqueHebdo, GraphiqueTrajectoire } from '@/components/charts';
import { formaterDate, formaterEuros, formaterPoints } from '@/lib/format';
import { EchellePaliers, FrisePaliers, JaugeObjectif, TuileStat } from '@/components/indicateurs';
import { SelecteurPeriode } from '@/components/selecteur-periode';
import { Badge, Carte, EnteteCarte } from '@/components/ui/primitives';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PageAccueil({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const reglages = await lireReglages();
  const demande = typeof params['periode'] === 'string' ? params['periode'] : null;
  const periode = demande && estIdPeriodeValide(demande) ? demande : reglages.periodeActive;

  const [leads, leadsPeriodePrecedente, objectifPeriode] = await Promise.all([
    listerTousLeads({ periode }),
    listerTousLeads({ periode: periodePrecedente(periode) }),
    lireObjectif(periode),
  ]);

  const stats = construireStats({ leads, leadsPeriodePrecedente, objectif: objectifPeriode });

  const { kpis, synthese, objectif } = stats;
  const parStatut = new Map(stats.parStatut.map((s) => [s.cle, s.leads]));
  const qualifies =
    (parStatut.get('qualifie') ?? 0) + (parStatut.get('active') ?? 0) + (parStatut.get('reactive') ?? 0);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Vue d’ensemble</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {stats.periode.label} · du {formaterDate(stats.periode.debut)} au {formaterDate(stats.periode.fin)} ·{' '}
            {stats.joursRestants > 0 ? `${stats.joursRestants} jours restants` : 'période terminée'}
          </p>
        </div>
        <SelecteurPeriode
          periodes={periodesAutour(periode, 5, 2).map((p) => ({ id: p.id, label: p.label }))}
          actuelle={periode}
        />
      </header>

      {kpis.leadsTotal === 0 ? (
        <Carte className="px-5 py-8 text-center">
          <p className="text-sm font-medium text-ink">Aucun lead sur {stats.periode.label}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-ink-muted">
            Ajoutez un lead manuellement, importez un CSV, ou branchez l’ingestion Slack et e-mail
            depuis la page Intégrations.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link
              href="/leads"
              className="inline-flex h-9 items-center rounded-lg border border-transparent bg-[var(--s1)] px-3.5 text-[13px] font-medium text-white"
            >
              Ajouter un lead
            </Link>
            <Link
              href="/integrations"
              className="inline-flex h-9 items-center rounded-lg border border-hair-fort px-3.5 text-[13px] font-medium text-ink"
            >
              Connecter les sources
            </Link>
          </div>
        </Carte>
      ) : null}

      {/* Deux dispositifs de prime, deux jauges. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <JaugeObjectif
            titre="Points entrants"
            valeur={kpis.points}
            cible={objectif.ciblePoints}
            unite="pts"
            avancement={stats.avancement}
            projection={synthese.projectionPoints}
            prime={synthese.primePoints}
          />
          <Carte className="px-5 py-4">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Paliers volume
            </p>
            <FrisePaliers valeur={kpis.points} paliers={objectif.paliersPoints} unite="pts" />
            <div className="mt-3 border-t border-hair pt-3">
              <EchellePaliers valeur={kpis.points} prime={synthese.primePoints} unite="pts" />
              {stats.joursRestants > 0 && kpis.points < objectif.ciblePoints ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Rythme nécessaire :{' '}
                  <strong className="font-medium text-ink tabulaire">
                    {formaterPoints(stats.rythmePointsParSemaine)} pts / semaine
                  </strong>
                </p>
              ) : null}
            </div>
          </Carte>
        </div>

        <div className="flex flex-col gap-3">
          <JaugeObjectif
            titre="Opportunités activées / réactivées"
            valeur={kpis.opportunites}
            cible={objectif.cibleActivation}
            unite="opp."
            avancement={stats.avancement}
            projection={synthese.projectionOpportunites}
            prime={synthese.primeActivation}
          />
          <Carte className="px-5 py-4">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Paliers activation
            </p>
            <FrisePaliers
              valeur={kpis.opportunites}
              paliers={objectif.paliersActivation}
              unite="opp."
              primeParUniteSupplementaire={objectif.primeParOpportuniteSupplementaire}
            />
            <div className="mt-3 border-t border-hair pt-3">
              <EchellePaliers
                valeur={kpis.opportunites}
                prime={synthese.primeActivation}
                unite="opp."
                primeParUniteSupplementaire={objectif.primeParOpportuniteSupplementaire}
              />
            </div>
          </Carte>
        </div>
      </div>

      <Carte className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Prime totale projetée sur {stats.periode.label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {formaterEuros(synthese.primeTotale)}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-2">
          <li>
            Volume : <strong className="font-medium text-ink">{formaterEuros(synthese.primePoints.montant)}</strong>
          </li>
          <li>
            Activation :{' '}
            <strong className="font-medium text-ink">{formaterEuros(synthese.primeActivation.montant)}</strong>
          </li>
        </ul>
      </Carte>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TuileStat
          libelle="Leads reçus"
          valeur={kpis.leadsTotal}
          delta={stats.comparaison.deltaLeads}
          aide={`vs ${stats.comparaison.leads} au trimestre précédent`}
        />
        <TuileStat
          libelle="Points validés"
          valeur={kpis.points}
          unite="pts"
          delta={stats.comparaison.deltaPoints}
          accent
        />
        <TuileStat
          libelle="Leads exclus"
          valeur={kpis.leadsExclus}
          aide="clients, distributeurs, renouvellements"
        />
        <TuileStat
          libelle="Taux d’activation"
          valeur={kpis.tauxActivation}
          unite="%"
          aide={`${kpis.opportunites} opp. sur ${kpis.leadsEligibles} leads comptabilisés`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TuileStat
          libelle="Points inbound"
          valeur={kpis.pointsInbound}
          unite="pts"
          aide="site, newsletter, salons…"
        />
        <TuileStat
          libelle="Points outbound"
          valeur={kpis.pointsOutbound}
          unite="pts"
          aide="lead magnets servis en campagne ou par un BDR (0,5)"
        />
        <TuileStat
          libelle="Activations / réactivations"
          valeur={`${kpis.activations} / ${kpis.reactivations}`}
          delta={stats.comparaison.deltaOpportunites}
        />
        <TuileStat
          libelle="À vérifier"
          valeur={kpis.leadsAVerifier}
          aide="classification automatique incertaine"
          badge={
            kpis.leadsAVerifier > 0 ? (
              <Badge ton="attention" icone={<span aria-hidden>!</span>}>
                action
              </Badge>
            ) : undefined
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <GraphiqueTrajectoire serie={stats.serie} ciblePoints={objectif.ciblePoints} />
        <GraphiqueHebdo serie={stats.serie} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <BarresRepartition
          titre="Par segment"
          sousTitre="Points et volume par type de prospect"
          donnees={stats.parSegment}
        />
        <BarresRepartition
          titre="Par initiative"
          sousTitre="Ce qui a déclenché la demande"
          donnees={stats.parInitiative}
        />
        <BarresRepartition
          titre="Par type de demande"
          sousTitre="Nature de la demande entrante"
          donnees={stats.parTypeDemande}
        />
        <Entonnoir
          titre="Entonnoir de qualification"
          etapes={[
            { label: 'Leads reçus', valeur: kpis.leadsTotal },
            { label: 'Leads comptabilisés', valeur: kpis.leadsEligibles, aide: 'hors clients, distributeurs et renouvellements' },
            { label: 'Qualifiés ou plus', valeur: qualifies },
            { label: 'Opportunités inbound', valeur: kpis.opportunites },
          ]}
        />
        <BarresRepartition
          titre="Par canal de collecte"
          sousTitre="Par où l’information nous est parvenue"
          donnees={stats.parSourceCollecte}
        />
        <Carte className="flex flex-col">
          <EnteteCarte titre="Meilleures campagnes & ressources" sousTitre="Sur la période sélectionnée" />
          <div className="grid flex-1 gap-4 px-5 pb-4 sm:grid-cols-2">
            <ListeTop titre="Campagnes" entrees={stats.topCampagnes} />
            <ListeTop titre="Lead magnets" entrees={stats.topLeadMagnets} />
          </div>
        </Carte>
      </div>
    </div>
  );
}

function ListeTop({
  titre,
  entrees,
}: {
  titre: string;
  entrees: Array<{ cle: string; label: string; leads: number; points: number }>;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted">{titre}</p>
      {entrees.length === 0 ? (
        <p className="text-xs text-ink-muted">Rien de renseigné sur la période.</p>
      ) : (
        <ol className="space-y-1.5">
          {entrees.map((e) => (
            <li key={e.cle} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-ink-2" title={e.label}>
                {e.label}
              </span>
              <span className="shrink-0 font-medium text-ink tabulaire">{formaterPoints(e.points)} pts</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
