'use client';

/** Primitives d'interface partagées : cartes, boutons, champs, badges, états. */
import clsx from 'clsx';
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Carte({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={clsx(
        'rounded-xl border border-hair bg-surface shadow-[var(--ombre-carte)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EnteteCarte({
  titre,
  sousTitre,
  action,
}: {
  titre: ReactNode;
  sousTitre?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight text-ink">{titre}</h2>
        {sousTitre ? <p className="mt-0.5 text-xs text-ink-muted">{sousTitre}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type VarianteBouton = 'principal' | 'secondaire' | 'discret' | 'danger';

const BOUTONS: Record<VarianteBouton, string> = {
  principal:
    'bg-[var(--s1)] text-white hover:brightness-110 active:brightness-95 border-transparent',
  secondaire:
    'bg-surface text-ink border-hair-fort hover:bg-surface-2',
  discret: 'bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-transparent text-[var(--critical)] border-hair-fort hover:bg-[color-mix(in_srgb,var(--critical)_10%,transparent)]',
};

export function Bouton({
  variante = 'secondaire',
  taille = 'normal',
  className,
  enCours,
  children,
  ...rest
}: {
  variante?: VarianteBouton;
  taille?: 'normal' | 'petit';
  enCours?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || enCours}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-[background-color,color,filter] disabled:cursor-not-allowed disabled:opacity-55',
        taille === 'petit' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-[13px]',
        BOUTONS[variante],
        className,
      )}
    >
      {enCours ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-3.5 w-3.5 animate-spin', className)} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

type TonBadge = 'neutre' | 'bon' | 'attention' | 'critique' | 'info';

const BADGES: Record<TonBadge, string> = {
  neutre: 'bg-surface-2 text-ink-2 border-hair',
  info: 'bg-[color-mix(in_srgb,var(--s1)_12%,transparent)] text-[var(--s1)] border-[color-mix(in_srgb,var(--s1)_28%,transparent)]',
  bon: 'bg-[color-mix(in_srgb,var(--good)_14%,transparent)] text-[var(--good-texte)] border-[color-mix(in_srgb,var(--good)_30%,transparent)]',
  attention:
    'bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] text-ink border-[color-mix(in_srgb,var(--warning)_40%,transparent)]',
  critique:
    'bg-[color-mix(in_srgb,var(--critical)_12%,transparent)] text-[var(--critical)] border-[color-mix(in_srgb,var(--critical)_30%,transparent)]',
};

export function Badge({
  ton = 'neutre',
  children,
  className,
  icone,
}: {
  ton?: TonBadge;
  children: ReactNode;
  className?: string;
  icone?: ReactNode;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap',
        BADGES[ton],
        className,
      )}
    >
      {icone}
      {children}
    </span>
  );
}

export function Champ({
  label,
  aide,
  erreur,
  children,
  className,
}: {
  label: string;
  aide?: ReactNode;
  erreur?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
      {erreur ? (
        <span className="text-xs text-[var(--critical)]">{erreur}</span>
      ) : aide ? (
        <span className="text-xs text-ink-muted">{aide}</span>
      ) : null}
    </label>
  );
}

const CONTROLE =
  'h-9 w-full rounded-lg border border-hair-fort bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-muted transition-colors hover:border-[var(--axis)] disabled:opacity-55';

export function Entree({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={clsx(CONTROLE, className)} />;
}

export function ZoneTexte({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={clsx(CONTROLE, 'h-auto min-h-20 py-2 leading-relaxed', className)}
    />
  );
}

export function Selection({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={clsx(CONTROLE, 'cursor-pointer pr-8 appearance-none', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5' stroke='%23898781' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        backgroundSize: '12px',
      }}
    >
      {children}
    </select>
  );
}

export function Interrupteur({
  actif,
  onChange,
  label,
  id,
}: {
  actif: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={actif}
      aria-label={label}
      onClick={() => onChange(!actif)}
      className={clsx(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
        actif ? 'border-transparent bg-[var(--s1)]' : 'border-hair-fort bg-surface-2',
      )}
    >
      <span
        className={clsx(
          'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left]',
          actif ? 'left-[18px]' : 'left-[2px]',
        )}
      />
    </button>
  );
}

export function EtatVide({
  titre,
  description,
  action,
}: {
  titre: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink">{titre}</p>
      {description ? <p className="max-w-sm text-xs text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Variation en pourcentage, avec icône + signe : jamais la couleur seule. */
export function Delta({ valeur, suffixe = '%' }: { valeur: number | null; suffixe?: string }) {
  if (valeur === null) {
    return <span className="text-xs text-ink-muted">nouveau</span>;
  }
  if (valeur === 0) {
    return <span className="text-xs text-ink-muted">= stable</span>;
  }
  const positif = valeur > 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium tabulaire"
      style={{ color: positif ? 'var(--good-texte)' : 'var(--critical)' }}
    >
      <span aria-hidden>{positif ? '▲' : '▼'}</span>
      {positif ? '+' : ''}
      {valeur}
      {suffixe}
    </span>
  );
}
