'use client';

/** Bascule de thème : suit le système par défaut, mémorise le choix explicite. */
import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
const CLE = 'dashboard-leads:theme';

function appliquer(theme: Theme) {
  const racine = document.documentElement;
  if (theme === 'system') racine.removeAttribute('data-theme');
  else racine.setAttribute('data-theme', theme);
}

export function BasculeTheme() {
  const [theme, setTheme] = useState<Theme>('system');
  const [monte, setMonte] = useState(false);

  useEffect(() => {
    const stocke = (localStorage.getItem(CLE) as Theme | null) ?? 'system';
    setTheme(stocke);
    appliquer(stocke);
    setMonte(true);
  }, []);

  function choisir(suivant: Theme) {
    setTheme(suivant);
    appliquer(suivant);
    try {
      localStorage.setItem(CLE, suivant);
    } catch {
      // Navigation privée : le thème reste valable pour la session.
    }
  }

  const options: Array<{ valeur: Theme; label: string; icone: string }> = [
    { valeur: 'light', label: 'Thème clair', icone: '☀' },
    { valeur: 'system', label: 'Thème système', icone: '◐' },
    { valeur: 'dark', label: 'Thème sombre', icone: '☾' },
  ];

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-hair bg-surface p-0.5" role="group" aria-label="Thème">
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          title={o.label}
          aria-label={o.label}
          aria-pressed={monte && theme === o.valeur}
          onClick={() => choisir(o.valeur)}
          className={
            'flex h-6 w-7 items-center justify-center rounded-md text-xs transition-colors ' +
            (monte && theme === o.valeur
              ? 'bg-surface-3 text-ink'
              : 'text-ink-muted hover:text-ink')
          }
        >
          <span aria-hidden>{o.icone}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Applique le thème mémorisé avant le premier rendu peint, pour éviter
 * le flash clair sur un poste réglé en sombre.
 */
export function ScriptTheme() {
  const code = `(function(){try{var t=localStorage.getItem('${CLE}');if(t&&t!=='system')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
