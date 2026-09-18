'use client';

/** Barre latérale de navigation. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { clientAuthNavigateur } from '@/lib/auth/browser';

const LIENS = [
  { href: '/', label: 'Vue d’ensemble', icone: '◧' },
  { href: '/leads', label: 'Leads', icone: '☰' },
  { href: '/objectifs', label: 'Objectifs & primes', icone: '◎' },
  { href: '/regles', label: 'Règles de comptage', icone: '§' },
  { href: '/integrations', label: 'Intégrations', icone: '⇄' },
  { href: '/compte', label: 'Mon compte', icone: '●' },
] as const;

export function Navigation({ orientation = 'verticale' }: { orientation?: 'verticale' | 'horizontale' }) {
  const chemin = usePathname();
  return (
    <nav
      className={clsx('flex gap-0.5', orientation === 'verticale' ? 'flex-col' : 'flex-row')}
      aria-label="Navigation principale"
    >
      {LIENS.map((lien) => {
        const actif = lien.href === '/' ? chemin === '/' : chemin.startsWith(lien.href);
        return (
          <Link
            key={lien.href}
            href={lien.href}
            aria-current={actif ? 'page' : undefined}
            className={clsx(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors',
              actif
                ? 'bg-surface-3 font-medium text-ink'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
          >
            <span aria-hidden className="w-4 text-center text-ink-muted">
              {lien.icone}
            </span>
            {lien.label}
          </Link>
        );
      })}
      {process.env.NEXT_PUBLIC_SUPABASE_URL && (
        <button
          type="button"
          onClick={async () => {
            await clientAuthNavigateur().auth.signOut();
            window.location.replace('/connexion');
          }}
          className="rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
        >Déconnexion</button>
      )}
    </nav>
  );
}
