'use client';

/** Bloc de code copiable, pour les URL d'ingestion et les exemples d'appel. */
import { useState } from 'react';

export function BlocCode({ contenu, label }: { contenu: string; label?: string }) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    try {
      await navigator.clipboard.writeText(contenu);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé) : le texte reste sélectionnable.
    }
  }

  return (
    <div className="relative">
      {label ? <p className="mb-1 text-[11px] font-medium text-ink-2">{label}</p> : null}
      <pre className="overflow-x-auto rounded-lg border border-hair bg-surface-2 px-3 py-2.5 pr-20 text-[11px] leading-relaxed text-ink-2">
        <code>{contenu}</code>
      </pre>
      <button
        type="button"
        onClick={copier}
        className="absolute right-2 top-[calc(100%-2.25rem)] rounded-md border border-hair-fort bg-surface px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:text-ink"
        style={{ top: label ? '1.65rem' : '0.4rem' }}
      >
        {copie ? 'Copié' : 'Copier'}
      </button>
    </div>
  );
}
