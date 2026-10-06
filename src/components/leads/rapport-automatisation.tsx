'use client';

import { useEffect, useState } from 'react';
import { Badge, Carte, Spinner } from '@/components/ui/primitives';
import { formaterDateCourte, formaterPoints } from '@/lib/format';

interface ValidationRapport {
  id: string;
  dateReception: string;
  confirmeLe: string | null;
  nom: string | null;
  email: string | null;
  societe: string | null;
  confiance: number | null;
  points: number;
  regleLabel: string;
  explication: string;
  raisons: string[];
}

interface Rapport {
  total: number;
  validations: ValidationRapport[];
}

export function RapportAutomatisation() {
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    void fetch('/api/leads/rapport-automatisation')
      .then(async (reponse) => {
        const data = await reponse.json();
        if (!reponse.ok) throw new Error(data?.erreur ?? 'Rapport indisponible');
        if (actif) setRapport(data as Rapport);
      })
      .catch((cause: unknown) => {
        if (actif) setErreur(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { actif = false; };
  }, []);

  return (
    <Carte className="overflow-hidden">
      <details>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink marker:hidden">
          <span aria-hidden className="text-[var(--success)]">✓</span>
          Rapport des validations automatiques
          {rapport ? <Badge ton="bon">{rapport.total}</Badge> : erreur ? <Badge ton="critique">indisponible</Badge> : <Spinner />}
          <span className="ml-auto text-xs font-normal text-ink-muted">seuil 90 %</span>
        </summary>
        <div className="border-t border-hair px-4 py-3">
          {erreur ? <p className="text-xs text-[var(--critical)]">{erreur}</p> : null}
          {rapport?.validations.length === 0 ? (
            <p className="text-xs text-ink-muted">Aucun lead n’a encore été validé automatiquement.</p>
          ) : null}
          <div className="grid gap-2 lg:grid-cols-2">
            {rapport?.validations.map((validation) => (
              <article key={validation.id} className="rounded-lg border border-hair bg-surface-2 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-ink">
                      {validation.nom ?? validation.societe ?? validation.email ?? 'Lead sans nom'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      Reçu le {formaterDateCourte(validation.dateReception)} · confiance {Math.round((validation.confiance ?? 0) * 100)} %
                    </p>
                  </div>
                  <Badge ton="bon">{formaterPoints(validation.points)} pt</Badge>
                </div>
                <p className="mt-2 text-xs font-medium text-ink-2">{validation.regleLabel}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">{validation.explication}</p>
                {validation.raisons.length > 0 ? (
                  <p className="mt-1.5 text-[11px] leading-4 text-ink-2">Pourquoi : {validation.raisons.join(' ')}</p>
                ) : null}
              </article>
            ))}
          </div>
          {rapport && rapport.total > rapport.validations.length ? (
            <p className="mt-2 text-[11px] text-ink-muted">Les {rapport.validations.length} validations les plus récentes sont affichées.</p>
          ) : null}
        </div>
      </details>
    </Carte>
  );
}
