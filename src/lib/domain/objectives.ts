/**
 * Objectifs trimestriels et calcul des primes.
 *
 * Deux dispositifs indépendants, cumulables :
 *  1. Volume : un objectif de points sur le trimestre (ex. 60 pts → 200 €).
 *  2. Activation : des paliers d'opportunités activées / réactivées
 *     (15 → 200 €, 20 → 300 €, 25 → 400 €, puis 20 € par opportunité au-delà).
 */

export interface PalierPrime {
  /** Seuil à atteindre (points ou opportunités). */
  seuil: number;
  /** Montant de la prime en euros une fois le seuil atteint. */
  montant: number;
}

export interface Objectif {
  /** Période visée, ex. `2026-Q4`. */
  periode: string;
  /** Objectif de points entrants sur la période. */
  ciblePoints: number;
  /** Paliers de prime sur le volume de points. */
  paliersPoints: PalierPrime[];
  /** Paliers de prime sur les opportunités activées / réactivées. */
  paliersActivation: PalierPrime[];
  /** Prime marginale par opportunité au-delà du dernier palier d'activation. */
  primeParOpportuniteSupplementaire: number;
  /** Objectif indicatif d'opportunités (par défaut : dernier palier atteignable). */
  cibleActivation: number;
}

export const OBJECTIF_DEFAUT: Omit<Objectif, 'periode'> = {
  ciblePoints: 60,
  paliersPoints: [{ seuil: 60, montant: 200 }],
  paliersActivation: [
    { seuil: 15, montant: 200 },
    { seuil: 20, montant: 300 },
    { seuil: 25, montant: 400 },
  ],
  primeParOpportuniteSupplementaire: 20,
  cibleActivation: 25,
};

export interface ResultatPrime {
  /** Montant total dû pour ce dispositif. */
  montant: number;
  /** Palier atteint, `null` si aucun. */
  palierAtteint: PalierPrime | null;
  /** Prochain palier, `null` si le dernier est dépassé. */
  palierSuivant: PalierPrime | null;
  /** Ce qu'il manque pour atteindre le palier suivant (0 si aucun). */
  restePourPalierSuivant: number;
  /** Détail du surplus au-delà du dernier palier (dispositif activation). */
  supplement: { unites: number; montant: number } | null;
}

function trierPaliers(paliers: PalierPrime[]): PalierPrime[] {
  return [...paliers].sort((a, b) => a.seuil - b.seuil);
}

/**
 * Calcule une prime à paliers.
 *
 * Les paliers ne se cumulent pas : on retient le montant du plus haut palier
 * atteint. `primeParUniteSupplementaire` ajoute, le cas échéant, un montant
 * linéaire pour chaque unité au-delà du dernier palier.
 */
export function calculerPrime(
  valeur: number,
  paliers: PalierPrime[],
  primeParUniteSupplementaire = 0,
): ResultatPrime {
  const tries = trierPaliers(paliers);
  if (tries.length === 0) {
    return {
      montant: 0,
      palierAtteint: null,
      palierSuivant: null,
      restePourPalierSuivant: 0,
      supplement: null,
    };
  }

  let palierAtteint: PalierPrime | null = null;
  for (const palier of tries) {
    if (valeur >= palier.seuil) palierAtteint = palier;
  }
  const palierSuivant = tries.find((p) => valeur < p.seuil) ?? null;
  const dernier = tries[tries.length - 1]!;

  let supplement: ResultatPrime['supplement'] = null;
  if (primeParUniteSupplementaire > 0 && valeur > dernier.seuil) {
    const unites = Math.floor(valeur - dernier.seuil);
    if (unites > 0) supplement = { unites, montant: unites * primeParUniteSupplementaire };
  }

  const montant = (palierAtteint?.montant ?? 0) + (supplement?.montant ?? 0);
  return {
    montant,
    palierAtteint,
    palierSuivant,
    restePourPalierSuivant: palierSuivant ? arrondi(palierSuivant.seuil - valeur) : 0,
    supplement,
  };
}

export interface SyntheseObjectif {
  periode: string;
  points: number;
  ciblePoints: number;
  progressionPoints: number;
  opportunites: number;
  cibleActivation: number;
  progressionActivation: number;
  primePoints: ResultatPrime;
  primeActivation: ResultatPrime;
  primeTotale: number;
  /** Projection fin de période à rythme constant. */
  projectionPoints: number;
  projectionOpportunites: number;
}

/** Agrège points + opportunités contre un objectif et ses primes. */
export function synthetiserObjectif(params: {
  objectif: Objectif;
  points: number;
  opportunites: number;
  avancement: number;
}): SyntheseObjectif {
  const { objectif, points, opportunites } = params;
  const avancement = Math.min(1, Math.max(0, params.avancement));
  const primePoints = calculerPrime(points, objectif.paliersPoints);
  const primeActivation = calculerPrime(
    opportunites,
    objectif.paliersActivation,
    objectif.primeParOpportuniteSupplementaire,
  );
  const facteur = avancement > 0 ? 1 / avancement : 0;
  return {
    periode: objectif.periode,
    points: arrondi(points),
    ciblePoints: objectif.ciblePoints,
    progressionPoints: objectif.ciblePoints > 0 ? points / objectif.ciblePoints : 0,
    opportunites,
    cibleActivation: objectif.cibleActivation,
    progressionActivation:
      objectif.cibleActivation > 0 ? opportunites / objectif.cibleActivation : 0,
    primePoints,
    primeActivation,
    primeTotale: primePoints.montant + primeActivation.montant,
    projectionPoints: avancement > 0 ? arrondi(points * facteur) : arrondi(points),
    projectionOpportunites: avancement > 0 ? Math.round(opportunites * facteur) : opportunites,
  };
}

/** Rythme requis par semaine pour atteindre la cible. */
export function rythmeRequis(params: {
  cible: number;
  realise: number;
  joursRestants: number;
}): number {
  const reste = Math.max(0, params.cible - params.realise);
  if (params.joursRestants <= 0) return reste;
  return arrondi((reste / params.joursRestants) * 7);
}

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}
