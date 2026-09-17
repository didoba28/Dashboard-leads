'use client';

/**
 * Composants de visualisation.
 *
 * Règles appliquées : une seule échelle par graphique, couleurs catégorielles
 * assignées par entité (jamais par rang), légende dès deux séries, étiquettes
 * directes sélectives, grille et axes en filet discret, et une vue tableau
 * disponible pour chaque graphique (la couleur ne porte jamais seule
 * l'information).
 */
import { useId, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Carte, EnteteCarte } from './ui/primitives';
import type { PartRepartition, PointSerie } from '@/lib/analytics';
import { formaterPoints } from '@/lib/format';


// --- Enveloppe commune : titre, bascule graphique / tableau -------------------

export function CarteGraphique({
  titre,
  sousTitre,
  colonnes,
  lignes,
  action,
  children,
}: {
  titre: string;
  sousTitre?: string;
  /** En-têtes de la vue tableau (équivalent accessible du graphique). */
  colonnes: string[];
  lignes: Array<Array<string | number>>;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [vue, setVue] = useState<'graphique' | 'tableau'>('graphique');
  const idTableau = useId();

  return (
    <Carte className="flex flex-col">
      <EnteteCarte
        titre={titre}
        sousTitre={sousTitre}
        action={
          <div className="flex items-center gap-2">
            {action}
            <div className="inline-flex rounded-lg border border-hair bg-surface p-0.5" role="group" aria-label="Affichage">
              {(['graphique', 'tableau'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVue(v)}
                  aria-pressed={vue === v}
                  aria-controls={v === 'tableau' ? idTableau : undefined}
                  className={clsx(
                    'rounded-md px-2 py-0.5 text-[11px] transition-colors',
                    vue === v ? 'bg-surface-3 font-medium text-ink' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {v === 'graphique' ? 'Graphique' : 'Tableau'}
                </button>
              ))}
            </div>
          </div>
        }
      />
      <div className="px-2 pb-4">
        {vue === 'graphique' ? (
          children
        ) : (
          <div id={idTableau} className="max-h-72 overflow-auto px-3">
            <table className="w-full text-left text-xs tabulaire">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-hair">
                  {colonnes.map((c) => (
                    <th key={c} className="py-1.5 pr-3 font-medium text-ink-2 first:pl-0">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne, i) => (
                  <tr key={i} className="border-b border-hair/60 last:border-0">
                    {ligne.map((cellule, j) => (
                      <td key={j} className="py-1.5 pr-3 text-ink">
                        {typeof cellule === 'number' ? formaterPoints(cellule) : cellule}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Carte>
  );
}

// --- Infobulle partagée -------------------------------------------------------

interface EntreeInfobulle {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function Infobulle({
  active,
  payload,
  label,
  unite = 'pt',
}: {
  active?: boolean;
  payload?: EntreeInfobulle[];
  label?: string | number;
  unite?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-hair-fort bg-surface px-2.5 py-2 text-xs shadow-[var(--ombre-carte)]">
      <p className="mb-1 font-medium text-ink">Semaine du {label}</p>
      <ul className="space-y-0.5">
        {payload.map((entree, i) => (
          <li key={i} className="flex items-center gap-2 whitespace-nowrap">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: entree.color }}
            />
            <span className="text-ink-2">{entree.name}</span>
            <span className="ml-auto font-medium text-ink tabulaire">
              {typeof entree.value === 'number' ? formaterPoints(entree.value) : entree.value} {unite}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const AXE = { fontSize: 11, fill: 'var(--ink-muted)' };

function LegendePersonnalisee({ payload }: { payload?: Array<{ value?: string; color?: string }> }) {
  if (!payload) return null;
  return (
    <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {payload.map((entree, i) => (
        <li key={i} className="flex items-center gap-1.5 text-[11px] text-ink-2">
          <span
            aria-hidden
            className="h-2 w-2 rounded-[2px]"
            style={{ background: entree.color }}
          />
          {entree.value}
        </li>
      ))}
    </ul>
  );
}

// --- Trajectoire cumulée ------------------------------------------------------

export function GraphiqueTrajectoire({ serie, ciblePoints }: { serie: PointSerie[]; ciblePoints: number }) {
  return (
    <CarteGraphique
      titre="Trajectoire des points"
      sousTitre={`Points cumulés face à la trajectoire nécessaire pour atteindre ${formaterPoints(ciblePoints)} points`}
      colonnes={['Semaine', 'Points de la semaine', 'Cumul', 'Trajectoire cible']}
      lignes={serie.map((p) => [p.label, p.points, p.pointsCumules, p.cible])}
    >
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={serie} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="degradeCumul" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--s1)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--s1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
            <XAxis dataKey="label" tick={AXE} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} minTickGap={12} />
            <YAxis tick={AXE} tickLine={false} axisLine={false} width={38} allowDecimals={false} />
            <Tooltip content={<Infobulle />} cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} />
            <Legend content={<LegendePersonnalisee />} />
            <Area
              type="monotone"
              dataKey="pointsCumules"
              name="Points cumulés"
              stroke="var(--s1)"
              strokeWidth={2}
              fill="url(#degradeCumul)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
            />
            <Line
              type="linear"
              dataKey="cible"
              name="Trajectoire cible"
              stroke="var(--ink-muted)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </CarteGraphique>
  );
}

// --- Points hebdomadaires par famille d'initiative ----------------------------

const FAMILLES = [
  { cle: 'pointsSite', label: 'Site & inbound', couleur: 'var(--s1)' },
  { cle: 'pointsNewsletter', label: 'Newsletter', couleur: 'var(--s3)' },
  { cle: 'pointsOutbound', label: 'Outbound (0,5)', couleur: 'var(--s2)' },
] as const;

export function GraphiqueHebdo({ serie }: { serie: PointSerie[] }) {
  return (
    <CarteGraphique
      titre="Points par semaine"
      sousTitre="Répartition par origine de l’initiative"
      colonnes={['Semaine', 'Site & inbound', 'Newsletter', 'Outbound', 'Total']}
      lignes={serie.map((p) => [p.label, p.pointsSite, p.pointsNewsletter, p.pointsOutbound, p.points])}
    >
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={serie} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} barCategoryGap="28%">
            <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
            <XAxis dataKey="label" tick={AXE} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} minTickGap={12} />
            <YAxis tick={AXE} tickLine={false} axisLine={false} width={38} allowDecimals={false} />
            <Tooltip content={<Infobulle />} cursor={{ fill: 'var(--surface-2)' }} />
            <Legend content={<LegendePersonnalisee />} />
            {FAMILLES.map((f, i) => (
              <Bar
                key={f.cle}
                dataKey={f.cle}
                name={f.label}
                stackId="points"
                fill={f.couleur}
                /* Filet de la couleur de fond : sépare les segments empilés sans les cerner. */
                stroke="var(--surface)"
                strokeWidth={2}
                radius={i === FAMILLES.length - 1 ? [4, 4, 0, 0] : undefined}
                maxBarSize={38}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </CarteGraphique>
  );
}

// --- Répartitions : barres horizontales, une seule couleur --------------------

export function BarresRepartition({
  titre,
  sousTitre,
  donnees,
  unite = 'pt',
  couleur = 'var(--s1)',
}: {
  titre: string;
  sousTitre?: string;
  donnees: PartRepartition[];
  unite?: string;
  couleur?: string;
}) {
  const visibles = donnees.filter((d) => d.leads > 0);
  const max = Math.max(1, ...visibles.map((d) => d.points));
  const totalLeads = visibles.reduce((n, d) => n + d.leads, 0);

  return (
    <CarteGraphique
      titre={titre}
      sousTitre={sousTitre}
      colonnes={['Catégorie', 'Leads', 'Points']}
      lignes={visibles.map((d) => [d.label, d.leads, d.points])}
    >
      <div className="px-3 pt-1">
        {visibles.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-muted">Aucun lead sur la période.</p>
        ) : (
          <ul className="space-y-2.5">
            {visibles.map((d) => (
              <li key={d.cle}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs text-ink-2">{d.label}</span>
                  <span className="shrink-0 text-xs font-medium text-ink tabulaire">
                    {formaterPoints(d.points)} {unite}
                    <span className="ml-1.5 font-normal text-ink-muted">
                      · {d.leads} lead{d.leads > 1 ? 's' : ''}
                      {totalLeads > 0 ? ` (${Math.round((d.leads / totalLeads) * 100)} %)` : ''}
                    </span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.max(2, (d.points / max) * 100)}%`, background: couleur }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CarteGraphique>
  );
}

// --- Entonnoir des statuts ----------------------------------------------------

/** Rampe ordinale (une seule teinte, du clair au foncé) pour des étapes ordonnées. */
const RAMPE_ORDINALE = ['var(--seq-250)', 'var(--seq-350)', 'var(--seq-450)', 'var(--seq-550)', 'var(--seq-650)'];

export function Entonnoir({
  titre,
  etapes,
}: {
  titre: string;
  etapes: Array<{ label: string; valeur: number; aide?: string }>;
}) {
  const max = Math.max(1, ...etapes.map((e) => e.valeur));
  return (
    <CarteGraphique
      titre={titre}
      sousTitre="Chaque étape compte les leads qui l’ont atteinte"
      colonnes={['Étape', 'Leads']}
      lignes={etapes.map((e) => [e.label, e.valeur])}
    >
      <div className="space-y-2 px-3 pt-1">
        {etapes.map((etape, i) => (
          <div key={etape.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-xs text-ink-2">{etape.label}</span>
              <span className="text-xs font-medium text-ink tabulaire">{etape.valeur}</span>
            </div>
            <div className="h-6 w-full overflow-hidden rounded-md bg-surface-2">
              <div
                className="flex h-full items-center rounded-md px-2 transition-[width] duration-500"
                style={{
                  width: `${Math.max(3, (etape.valeur / max) * 100)}%`,
                  background: RAMPE_ORDINALE[Math.min(i, RAMPE_ORDINALE.length - 1)],
                }}
              />
            </div>
            {etape.aide ? <p className="mt-0.5 text-[11px] text-ink-muted">{etape.aide}</p> : null}
          </div>
        ))}
      </div>
    </CarteGraphique>
  );
}
