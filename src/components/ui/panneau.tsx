'use client';

/** Panneau latéral (drawer) : détail et édition sans quitter la liste. */
import { useEffect, type ReactNode } from 'react';
import { Bouton } from './primitives';

export function Panneau({
  ouvert,
  titre,
  sousTitre,
  onFermer,
  children,
}: {
  ouvert: boolean;
  titre: string;
  sousTitre?: ReactNode;
  onFermer: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!ouvert) return;
    function surTouche(e: KeyboardEvent) {
      if (e.key === 'Escape') onFermer();
    }
    document.addEventListener('keydown', surTouche);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', surTouche);
      document.body.style.overflow = overflow;
    };
  }, [ouvert, onFermer]);

  if (!ouvert) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={titre}>
      <button
        type="button"
        aria-label="Fermer le panneau"
        onClick={onFermer}
        className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
      />
      <div className="apparition relative flex h-full w-full max-w-xl flex-col border-l border-hair bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-hair px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-ink">{titre}</h2>
            {sousTitre ? <div className="mt-0.5 text-xs text-ink-muted">{sousTitre}</div> : null}
          </div>
          <Bouton variante="discret" taille="petit" onClick={onFermer} aria-label="Fermer">
            ✕
          </Bouton>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
