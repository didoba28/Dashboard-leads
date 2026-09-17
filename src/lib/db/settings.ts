/** Réglages applicatifs et objectifs trimestriels. */
import { getDb, maintenantIso } from './index';
import { OBJECTIF_DEFAUT, type Objectif, type PalierPrime } from '@/lib/domain/objectives';
import type { ArbitrageB2cNewsletter } from '@/lib/domain/scoring';
import { estIdPeriodeValide } from '@/lib/domain/periods';

export interface Reglages {
  /** Période affichée par défaut sur le dashboard. */
  periodeActive: string;
  /** Arbitrage du cas « lead magnet newsletter rempli par un B2C ». */
  arbitrageB2cNewsletter: ArbitrageB2cNewsletter;
  /** Fenêtre de déduplication, en jours. */
  fenetreDedupeJours: number;
  /** Nom de la base Notion connectée (informatif). */
  notionDatabaseId: string | null;
  notionDataSourceId: string | null;
  /** Horodatage du dernier `pull` Notion réussi. */
  notionDernierPull: string | null;
}

export const REGLAGES_DEFAUT: Reglages = {
  periodeActive: '2026-Q4',
  arbitrageB2cNewsletter: 'newsletter',
  fenetreDedupeJours: 30,
  notionDatabaseId: null,
  notionDataSourceId: null,
  notionDernierPull: null,
};

export function lireReglages(): Reglages {
  const db = getDb();
  const lignes = db.prepare<[], { cle: string; valeur: string }>('SELECT cle, valeur FROM reglages').all();
  const out: Record<string, unknown> = { ...REGLAGES_DEFAUT };
  for (const ligne of lignes) {
    try {
      out[ligne.cle] = JSON.parse(ligne.valeur);
    } catch {
      out[ligne.cle] = ligne.valeur;
    }
  }
  const reglages = out as unknown as Reglages;
  if (!estIdPeriodeValide(reglages.periodeActive)) reglages.periodeActive = REGLAGES_DEFAUT.periodeActive;
  return reglages;
}

export function ecrireReglages(patch: Partial<Reglages>): Reglages {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO reglages (cle, valeur, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, updated_at = excluded.updated_at`,
  );
  const now = maintenantIso();
  db.transaction(() => {
    for (const [cle, valeur] of Object.entries(patch)) {
      if (valeur === undefined) continue;
      stmt.run(cle, JSON.stringify(valeur), now);
    }
  })();
  return lireReglages();
}

interface LigneObjectif {
  periode: string;
  cible_points: number;
  paliers_points: string;
  paliers_activation: string;
  prime_par_opportunite_supplementaire: number;
  cible_activation: number;
}

function versObjectif(ligne: LigneObjectif): Objectif {
  return {
    periode: ligne.periode,
    ciblePoints: ligne.cible_points,
    paliersPoints: JSON.parse(ligne.paliers_points) as PalierPrime[],
    paliersActivation: JSON.parse(ligne.paliers_activation) as PalierPrime[],
    primeParOpportuniteSupplementaire: ligne.prime_par_opportunite_supplementaire,
    cibleActivation: ligne.cible_activation,
  };
}

/** Objectif d'une période — crée l'objectif par défaut s'il n'existe pas encore. */
export function lireObjectif(periode: string): Objectif {
  if (!estIdPeriodeValide(periode)) throw new Error(`Période invalide : ${periode}`);
  const db = getDb();
  const ligne = db
    .prepare<[string], LigneObjectif>('SELECT * FROM objectifs WHERE periode = ?')
    .get(periode);
  if (ligne) return versObjectif(ligne);
  return { periode, ...OBJECTIF_DEFAUT };
}

export function lireTousObjectifs(): Objectif[] {
  const db = getDb();
  return db
    .prepare<[], LigneObjectif>('SELECT * FROM objectifs ORDER BY periode DESC')
    .all()
    .map(versObjectif);
}

export function ecrireObjectif(objectif: Objectif): Objectif {
  if (!estIdPeriodeValide(objectif.periode)) throw new Error(`Période invalide : ${objectif.periode}`);
  const db = getDb();
  db.prepare(
    `INSERT INTO objectifs (periode, cible_points, paliers_points, paliers_activation,
        prime_par_opportunite_supplementaire, cible_activation, updated_at)
     VALUES (@periode, @ciblePoints, @paliersPoints, @paliersActivation,
        @primeParOpportuniteSupplementaire, @cibleActivation, @updatedAt)
     ON CONFLICT(periode) DO UPDATE SET
        cible_points = excluded.cible_points,
        paliers_points = excluded.paliers_points,
        paliers_activation = excluded.paliers_activation,
        prime_par_opportunite_supplementaire = excluded.prime_par_opportunite_supplementaire,
        cible_activation = excluded.cible_activation,
        updated_at = excluded.updated_at`,
  ).run({
    periode: objectif.periode,
    ciblePoints: objectif.ciblePoints,
    paliersPoints: JSON.stringify(objectif.paliersPoints),
    paliersActivation: JSON.stringify(objectif.paliersActivation),
    primeParOpportuniteSupplementaire: objectif.primeParOpportuniteSupplementaire,
    cibleActivation: objectif.cibleActivation,
    updatedAt: maintenantIso(),
  });
  return lireObjectif(objectif.periode);
}
