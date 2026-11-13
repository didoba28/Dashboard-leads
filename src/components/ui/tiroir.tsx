'use client';

import { useState, type ReactNode } from 'react';

export function Tiroir({ titre, compteur, children, chargerALOuverture = false }: {
  titre: string;
  compteur?: number;
  children: ReactNode;
  chargerALOuverture?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <details className="group rounded-xl border border-hair bg-surface" onToggle={chargerALOuverture ? (e) => setOuvert(e.currentTarget.open) : undefined}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-ink hover:bg-surface-2 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{titre}</span>
        {compteur === undefined ? null : <span className="rounded-md bg-surface-2 px-2 py-1 text-xs font-medium tabulaire text-ink-2">{compteur} dossier{compteur === 1 ? '' : 's'}</span>}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden className="shrink-0 text-s1 transition-transform group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      {!chargerALOuverture || ouvert ? children : null}
    </details>
  );
}
