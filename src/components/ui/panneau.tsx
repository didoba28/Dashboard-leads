'use client';

/** Panneau latéral (drawer) : détail et édition sans quitter la liste. */
import { useEffect, useRef, type ReactNode } from 'react';
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
  const panneauRef = useRef<HTMLDivElement>(null);
  const fermerRef = useRef(onFermer);
  useEffect(() => { fermerRef.current = onFermer; }, [onFermer]);
  useEffect(() => {
    if (!ouvert) return;
    const focusPrecedent = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panneauRef.current?.focus();
    function surTouche(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        fermerRef.current();
      }
      if (e.key !== 'Tab') return;
      const panneau = panneauRef.current;
      if (!panneau) return;
      const accessibles = Array.from(panneau.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]',
      )).filter((element) => element.offsetParent !== null);
      const premier = accessibles[0];
      const dernier = accessibles.at(-1);
      if (!premier || !dernier) {
        e.preventDefault();
        panneau.focus();
      } else if (e.shiftKey && (document.activeElement === premier || document.activeElement === panneau)) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && (document.activeElement === dernier || document.activeElement === panneau)) {
        e.preventDefault();
        premier.focus();
      }
    }
    document.addEventListener('keydown', surTouche);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', surTouche);
      document.body.style.overflow = overflow;
      if (focusPrecedent?.isConnected) focusPrecedent.focus();
    };
  }, [ouvert]);

  if (!ouvert) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={titre}>
      <button
        type="button"
        aria-label="Fermer le panneau"
        onClick={onFermer}
        className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
      />
      <div ref={panneauRef} tabIndex={-1} className="apparition relative flex h-full w-full max-w-2xl flex-col border-l border-hair bg-surface shadow-2xl">
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
