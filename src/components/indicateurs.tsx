'use client';

/** Tuiles de synthèse, jauges d'objectif et échelle de paliers de prime. */
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Badge, Carte, Delta } from './ui/primitives';
import { formaterEuros, formaterPoints } from '@/lib/format';
import type { ResultatPrime } from '@/lib/domain/objectives';

export function TuileStat({
  libelle,
  valeur,
  unite,
  aide,
  delta,
  accent,
  badge,
}: {
  libelle: string;
  valeur: string | number;
  unite?: string;
  aide?: ReactNode;
  delta?: number | null;
  accent?: boolean;
  badge?: ReactNode;
}) {
  return (
    <Carte className={clsx('px-4 py-3.5', accent && 'ring-1 ring-[color-mix(in_srgb,var(--s1)_30%,transparent)]')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{libelle}</p>
        {badge}
      </div>
      <p className="mt-1.5 flex items-baseline gap-1 text-2xl font-semibold tracking-tight text-ink">
        {typeof valeur === 'number' ? formaterPoints(valeur) : valeur}
        {unite ? <span className="text-sm font-normal text-ink-muted">{unite}</span> : null}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {delta !== undefined ? <Delta valeur={delta} /> : null}
        {aide ? <span className="text-xs text-ink-muted">{aide}</span> : null}
      </div>
    </Carte>
  );
}

/**
 * Jauge d'objectif : progression réelle, plus un repère « où l'on devrait
 * être » compte tenu du temps écoulé dans le trimestre.
 */
export function JaugeObjectif({
  titre,
  valeur,
  cible,
  unite,
  avancement,
  projection,
  prime,
}: {
  titre: string;
  valeur: number;
  cible: number;
  unite: string;
  avancement: number;
  projection: number;
  prime: ResultatPrime;
}) {
  const progression = cible > 0 ? Math.min(1, valeur / cible) : 0;
  const attendu = Math.min(1, avancement);
  // Tant que la période n'a pas commencé, parler de retard n'aurait aucun sens.
  const nonCommencee = avancement <= 0;
  const enRetard = !nonCommencee && cible > 0 && valeur < cible * avancement;

  return (
    <Carte className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{titre}</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tracking-tight text-ink">{formaterPoints(valeur)}</span>
            <span className="text-sm text-ink-muted">
              / {formaterPoints(cible)} {unite}
            </span>
          </p>
        </div>
        <Badge
          ton={nonCommencee ? 'neutre' : enRetard ? 'attention' : 'bon'}
          icone={<span aria-hidden>{nonCommencee ? '·' : enRetard ? '!' : '✓'}</span>}
        >
          {nonCommencee ? 'Période à venir' : enRetard ? 'En retard sur le rythme' : 'Dans le rythme'}
        </Badge>
      </div>

      <div className="relative mt-4 h-2.5 w-full rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${progression * 100}%`, background: 'var(--s1)' }}
        />
        {/* Repère du rythme attendu à la date du jour. */}
        {nonCommencee ? null : (
        <div
          className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ink-muted)]"
          style={{ left: `calc(${attendu * 100}% - 1px)` }}
          title="Où l’on devrait être aujourd’hui"
          aria-hidden
        />
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-muted">
        <span>{Math.round(progression * 100)} % de l’objectif</span>
        <span>
          {nonCommencee ? 'Période pas encore commencée' : `Repère du jour : ${Math.round(attendu * 100)} %`}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-hair pt-3 text-xs">
        <div>
          <dt className="text-ink-muted">{nonCommencee ? 'Déjà enregistré' : 'Projection fin de période'}</dt>
          <dd className="mt-0.5 font-medium text-ink tabulaire">
            {formaterPoints(projection)} {unite}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Prime acquise à ce jour</dt>
          <dd className="mt-0.5 font-medium text-ink tabulaire">{formaterEuros(prime.montant)}</dd>
        </div>
      </dl>
    </Carte>
  );
}

/** Échelle des paliers de prime : ce qui est acquis, ce qui vient ensuite. */
export function EchellePaliers({
  valeur,
  prime,
  unite,
  primeParUniteSupplementaire,
}: {
  valeur: number;
  prime: ResultatPrime;
  unite: string;
  primeParUniteSupplementaire?: number;
}) {
  return (
    <div className="space-y-2">
      {prime.palierSuivant ? (
        <p className="text-xs text-ink-2">
          Encore{' '}
          <strong className="font-semibold text-ink tabulaire">
            {formaterPoints(prime.restePourPalierSuivant)} {unite}
          </strong>{' '}
          pour atteindre {formaterEuros(prime.palierSuivant.montant)}.
        </p>
      ) : (
        <p className="text-xs text-ink-2">
          Dernier palier atteint.
          {primeParUniteSupplementaire
            ? ` Chaque ${unite} supplémentaire ajoute ${formaterEuros(primeParUniteSupplementaire)}.`
            : ''}
        </p>
      )}
      {prime.supplement ? (
        <p className="text-xs text-ink-muted">
          Dont {formaterEuros(prime.supplement.montant)} pour {prime.supplement.unites} {unite}{' '}
          au-delà du dernier palier.
        </p>
      ) : null}
      <p className="sr-only">
        Valeur courante : {formaterPoints(valeur)} {unite}
      </p>
    </div>
  );
}

/** Frise des paliers avec position courante. */
export function FrisePaliers({
  valeur,
  paliers,
  unite,
  primeParUniteSupplementaire = 0,
}: {
  valeur: number;
  paliers: Array<{ seuil: number; montant: number }>;
  unite: string;
  primeParUniteSupplementaire?: number;
}) {
  const tries = [...paliers].sort((a, b) => a.seuil - b.seuil);
  if (tries.length === 0) return null;
  const max = Math.max(tries[tries.length - 1]!.seuil, valeur);

  return (
    <div>
      <div className="relative h-2.5 w-full rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.min(100, (valeur / max) * 100)}%`, background: 'var(--s1)' }}
        />
        {tries.map((palier) => (
          <div
            key={palier.seuil}
            className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full"
            style={{
              left: `calc(${(palier.seuil / max) * 100}% - 1px)`,
              background: valeur >= palier.seuil ? 'var(--good)' : 'var(--axis)',
            }}
            aria-hidden
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {tries.map((palier) => {
          const atteint = valeur >= palier.seuil;
          return (
            <li key={palier.seuil} className="flex items-center gap-1.5 text-[11px]">
              <span aria-hidden className={atteint ? 'text-[var(--good-texte)]' : 'text-ink-muted'}>
                {atteint ? '✓' : '○'}
              </span>
              <span className={atteint ? 'font-medium text-ink' : 'text-ink-muted'}>
                {formaterPoints(palier.seuil)} {unite} → {formaterEuros(palier.montant)}
              </span>
            </li>
          );
        })}
        {primeParUniteSupplementaire > 0 ? (
          <li className="text-[11px] text-ink-muted">
            puis +{formaterEuros(primeParUniteSupplementaire)} par {unite} supplémentaire
          </li>
        ) : null}
      </ul>
    </div>
  );
}
