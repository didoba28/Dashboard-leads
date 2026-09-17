'use client';

/** File de notifications éphémères, rendue en haut à droite. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';

type TonToast = 'info' | 'succes' | 'erreur';

interface Toast {
  id: number;
  ton: TonToast;
  titre: string;
  detail?: string;
}

const Contexte = createContext<{ notifier: (t: Omit<Toast, 'id'>) => void } | null>(null);

export function FournisseurToasts({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notifier = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.ton === 'erreur' ? 8000 : 4500);
  }, []);

  const valeur = useMemo(() => ({ notifier }), [notifier]);

  return (
    <Contexte.Provider value={valeur}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'apparition pointer-events-auto rounded-lg border bg-surface px-3.5 py-2.5 shadow-[var(--ombre-carte)]',
              t.ton === 'erreur' && 'border-[color-mix(in_srgb,var(--critical)_40%,transparent)]',
              t.ton === 'succes' && 'border-[color-mix(in_srgb,var(--good)_40%,transparent)]',
              t.ton === 'info' && 'border-hair-fort',
            )}
          >
            <div className="flex items-start gap-2">
              <span aria-hidden className="mt-px text-xs">
                {t.ton === 'erreur' ? '✕' : t.ton === 'succes' ? '✓' : 'ℹ'}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{t.titre}</p>
                {t.detail ? <p className="mt-0.5 text-xs text-ink-2 break-words">{t.detail}</p> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Contexte.Provider>
  );
}

export function useToasts() {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error('useToasts doit être utilisé dans <FournisseurToasts>.');
  return ctx;
}
