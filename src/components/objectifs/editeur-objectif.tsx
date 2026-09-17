'use client';

/**
 * Édition d'un objectif trimestriel et simulation des primes.
 * Le simulateur utilise exactement le même calcul que le dashboard.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { calculerPrime, type Objectif, type PalierPrime } from '@/lib/domain/objectives';
import { Badge, Bouton, Carte, Champ, EnteteCarte, Entree } from '@/components/ui/primitives';
import { FrisePaliers } from '@/components/indicateurs';
import { formaterEuros, formaterPoints } from '@/lib/format';
import { useToasts } from '@/components/ui/toast';

function EditeurPaliers({
  paliers,
  unite,
  onChange,
}: {
  paliers: PalierPrime[];
  unite: string;
  onChange: (p: PalierPrime[]) => void;
}) {
  return (
    <div className="space-y-2">
      {paliers.map((palier, i) => (
        <div key={i} className="flex items-end gap-2">
          <Champ label={i === 0 ? `Seuil (${unite})` : ''} className="flex-1">
            <Entree
              type="number"
              min={0}
              step="0.5"
              value={palier.seuil}
              aria-label={`Seuil du palier ${i + 1}`}
              onChange={(e) => {
                const suivant = [...paliers];
                suivant[i] = { ...palier, seuil: Number(e.target.value) };
                onChange(suivant);
              }}
            />
          </Champ>
          <Champ label={i === 0 ? 'Prime (€)' : ''} className="flex-1">
            <Entree
              type="number"
              min={0}
              step="10"
              value={palier.montant}
              aria-label={`Montant du palier ${i + 1}`}
              onChange={(e) => {
                const suivant = [...paliers];
                suivant[i] = { ...palier, montant: Number(e.target.value) };
                onChange(suivant);
              }}
            />
          </Champ>
          <Bouton
            variante="discret"
            taille="petit"
            className="mb-1"
            onClick={() => onChange(paliers.filter((_, j) => j !== i))}
            aria-label={`Supprimer le palier ${i + 1}`}
          >
            ✕
          </Bouton>
        </div>
      ))}
      <Bouton
        taille="petit"
        onClick={() =>
          onChange([
            ...paliers,
            {
              seuil: (paliers[paliers.length - 1]?.seuil ?? 0) + 5,
              montant: (paliers[paliers.length - 1]?.montant ?? 0) + 100,
            },
          ])
        }
      >
        + Ajouter un palier
      </Bouton>
    </div>
  );
}

export function EditeurObjectif({
  objectifInitial,
  pointsReels,
  opportunitesReelles,
}: {
  objectifInitial: Objectif;
  pointsReels: number;
  opportunitesReelles: number;
}) {
  const [objectif, setObjectif] = useState<Objectif>(objectifInitial);
  const [enCours, setEnCours] = useState(false);
  const [simPoints, setSimPoints] = useState(pointsReels);
  const [simOpportunites, setSimOpportunites] = useState(opportunitesReelles);
  const { notifier } = useToasts();
  const router = useRouter();

  const primePoints = useMemo(
    () => calculerPrime(simPoints, objectif.paliersPoints),
    [simPoints, objectif.paliersPoints],
  );
  const primeActivation = useMemo(
    () =>
      calculerPrime(simOpportunites, objectif.paliersActivation, objectif.primeParOpportuniteSupplementaire),
    [simOpportunites, objectif.paliersActivation, objectif.primeParOpportuniteSupplementaire],
  );

  async function enregistrer() {
    setEnCours(true);
    try {
      const reponse = await fetch('/api/objectifs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(objectif),
      });
      const data = await reponse.json();
      if (!reponse.ok) throw new Error(data?.erreur ?? 'Enregistrement impossible');
      notifier({ ton: 'succes', titre: 'Objectif enregistré' });
      router.refresh();
    } catch (err) {
      notifier({
        ton: 'erreur',
        titre: 'Enregistrement impossible',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="flex flex-col gap-4">
        <Carte>
          <EnteteCarte
            titre="Objectif de volume"
            sousTitre="Points entrants à atteindre sur le trimestre et prime associée"
          />
          <div className="space-y-4 px-5 pb-5">
            <Champ label="Cible de points" aide="Sert de référence à la jauge et à la trajectoire">
              <Entree
                type="number"
                min={0}
                step="1"
                value={objectif.ciblePoints}
                onChange={(e) => setObjectif({ ...objectif, ciblePoints: Number(e.target.value) })}
                className="max-w-40"
              />
            </Champ>
            <div>
              <p className="mb-2 text-xs font-medium text-ink-2">Paliers de prime</p>
              <EditeurPaliers
                paliers={objectif.paliersPoints}
                unite="pts"
                onChange={(paliersPoints) => setObjectif({ ...objectif, paliersPoints })}
              />
            </div>
          </div>
        </Carte>

        <Carte>
          <EnteteCarte
            titre="Objectif d’activation"
            sousTitre="Opportunités activées ou réactivées par l’inbound"
          />
          <div className="space-y-4 px-5 pb-5">
            <div className="flex flex-wrap gap-4">
              <Champ label="Cible d’opportunités">
                <Entree
                  type="number"
                  min={0}
                  step="1"
                  value={objectif.cibleActivation}
                  onChange={(e) => setObjectif({ ...objectif, cibleActivation: Number(e.target.value) })}
                  className="max-w-40"
                />
              </Champ>
              <Champ label="Prime par opportunité au-delà du dernier palier (€)">
                <Entree
                  type="number"
                  min={0}
                  step="5"
                  value={objectif.primeParOpportuniteSupplementaire}
                  onChange={(e) =>
                    setObjectif({ ...objectif, primeParOpportuniteSupplementaire: Number(e.target.value) })
                  }
                  className="max-w-40"
                />
              </Champ>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-ink-2">Paliers de prime</p>
              <EditeurPaliers
                paliers={objectif.paliersActivation}
                unite="opp."
                onChange={(paliersActivation) => setObjectif({ ...objectif, paliersActivation })}
              />
            </div>
          </div>
        </Carte>

        <div className="flex items-center justify-end gap-2">
          <Bouton variante="discret" onClick={() => setObjectif(objectifInitial)}>
            Réinitialiser
          </Bouton>
          <Bouton variante="principal" onClick={enregistrer} enCours={enCours}>
            Enregistrer l’objectif
          </Bouton>
        </div>
      </div>

      <Carte className="h-fit xl:sticky xl:top-6">
        <EnteteCarte
          titre="Simulateur de prime"
          sousTitre="Ajustez les valeurs pour voir la prime correspondante"
          action={<Badge ton="info">{objectif.periode}</Badge>}
        />
        <div className="space-y-5 px-5 pb-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="sim-points" className="text-xs font-medium text-ink-2">
                Points entrants
              </label>
              <span className="text-sm font-semibold text-ink tabulaire">{formaterPoints(simPoints)}</span>
            </div>
            <input
              id="sim-points"
              type="range"
              min={0}
              max={Math.max(objectif.ciblePoints * 2, 20)}
              step={0.5}
              value={simPoints}
              onChange={(e) => setSimPoints(Number(e.target.value))}
              className="w-full accent-[var(--s1)]"
            />
            <div className="mt-3">
              <FrisePaliers valeur={simPoints} paliers={objectif.paliersPoints} unite="pts" />
            </div>
            <p className="mt-2 text-xs text-ink-2">
              Prime volume :{' '}
              <strong className="font-semibold text-ink">{formaterEuros(primePoints.montant)}</strong>
            </p>
          </div>

          <div className="border-t border-hair pt-4">
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="sim-opp" className="text-xs font-medium text-ink-2">
                Opportunités activées / réactivées
              </label>
              <span className="text-sm font-semibold text-ink tabulaire">{simOpportunites}</span>
            </div>
            <input
              id="sim-opp"
              type="range"
              min={0}
              max={Math.max(objectif.cibleActivation * 2, 10)}
              step={1}
              value={simOpportunites}
              onChange={(e) => setSimOpportunites(Number(e.target.value))}
              className="w-full accent-[var(--s1)]"
            />
            <div className="mt-3">
              <FrisePaliers
                valeur={simOpportunites}
                paliers={objectif.paliersActivation}
                unite="opp."
                primeParUniteSupplementaire={objectif.primeParOpportuniteSupplementaire}
              />
            </div>
            <p className="mt-2 text-xs text-ink-2">
              Prime activation :{' '}
              <strong className="font-semibold text-ink">{formaterEuros(primeActivation.montant)}</strong>
            </p>
          </div>

          <div className="rounded-lg bg-surface-2 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Prime totale</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              {formaterEuros(primePoints.montant + primeActivation.montant)}
            </p>
            <button
              type="button"
              onClick={() => {
                setSimPoints(pointsReels);
                setSimOpportunites(opportunitesReelles);
              }}
              className="mt-2 text-xs text-[var(--s1)] underline-offset-2 hover:underline"
            >
              Revenir aux chiffres réels ({formaterPoints(pointsReels)} pts · {opportunitesReelles} opp.)
            </button>
          </div>
        </div>
      </Carte>
    </div>
  );
}
