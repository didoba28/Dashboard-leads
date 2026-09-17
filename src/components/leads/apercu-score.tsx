'use client';

/** Aperçu du score : la règle appliquée est toujours affichée en clair. */
import { Badge } from '@/components/ui/primitives';
import { formaterPoints } from '@/lib/format';
import type { ResultatScoring } from '@/lib/domain/scoring';

export function AperçuScore({
  score,
  pointsForces,
}: {
  score: ResultatScoring;
  pointsForces?: number | null;
}) {
  const effectifs = pointsForces ?? score.points;
  const force = pointsForces != null && pointsForces !== score.points;

  return (
    <div className="rounded-lg border border-hair bg-surface-2 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Score appliqué
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              {formaterPoints(effectifs)}
            </span>
            <span className="text-xs text-ink-muted">point{effectifs > 1 ? 's' : ''}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge ton={score.eligible ? 'bon' : 'critique'} icone={<span aria-hidden>{score.eligible ? '✓' : '✕'}</span>}>
            {score.eligible ? 'Lead entrant' : 'Non comptabilisé'}
          </Badge>
          <Badge ton={score.eligibleActivation ? 'info' : 'neutre'}>
            {score.eligibleActivation ? 'Compte en activation' : 'Hors activation inbound'}
          </Badge>
          {force ? <Badge ton="attention">Arbitrage manuel</Badge> : null}
        </div>
      </div>
      <p className="mt-2 border-t border-hair pt-2 text-xs text-ink-2">
        <strong className="font-medium text-ink">{score.regleLabel}</strong> — {score.explication}
      </p>
      {force ? (
        <p className="mt-1 text-xs text-ink-muted">
          Le calcul automatique donnait {formaterPoints(score.points)} point
          {score.points > 1 ? 's' : ''}.
        </p>
      ) : null}
    </div>
  );
}
