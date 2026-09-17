'use client';

/**
 * Sélecteur de période : une seule commande, en haut, qui cadre toutes les
 * cartes de la page (pas de filtre par graphique).
 */
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { Selection } from './ui/primitives';

export function SelecteurPeriode({
  periodes,
  actuelle,
}: {
  periodes: Array<{ id: string; label: string }>;
  actuelle: string;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const [enCours, demarrer] = useTransition();

  function changer(periode: string) {
    const suivants = new URLSearchParams(params.toString());
    suivants.set('periode', periode);
    demarrer(() => router.push(`${chemin}?${suivants.toString()}`));
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="periode" className="text-xs text-ink-muted">
        Période
      </label>
      <Selection
        id="periode"
        value={actuelle}
        onChange={(e) => changer(e.target.value)}
        className="h-8 w-36 text-xs"
        aria-busy={enCours}
      >
        {periodes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Selection>
    </div>
  );
}
