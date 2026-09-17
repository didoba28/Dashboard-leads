/**
 * Moteur de scoring des leads entrants.
 *
 * Implémente littéralement les règles de suivi et de validation du pôle Growth.
 * Le moteur est *pur* (aucun accès I/O) et *ordonné* : la première règle dont la
 * condition est vraie décide. Chaque lead scoré conserve l'identifiant de la
 * règle appliquée, ce qui rend chaque point du dashboard justifiable.
 */
import {
  INITIATIVES_OUTBOUND,
  type Initiative,
  type Relation,
  type Segment,
  type TypeDemande,
} from './taxonomy';

/** Entrée minimale nécessaire au scoring. */
export interface EntreeScoring {
  segment: Segment;
  relation: Relation;
  typeDemande: TypeDemande;
  initiative: Initiative;
}

/**
 * Arbitrage du cas ambigu « lead magnet poussé en newsletter, rempli par un
 * prospect B2C » : la règle newsletter dit « compte pour 1 », la grille de
 * points dit « B2C = 0,5 ».
 *
 * - `newsletter` (défaut) : l'initiative Growth prime, le lead vaut 1 point.
 * - `segment` : la grille de points prime, un B2C vaut 0,5 point.
 */
export type ArbitrageB2cNewsletter = 'newsletter' | 'segment';

export interface OptionsScoring {
  arbitrageB2cNewsletter?: ArbitrageB2cNewsletter;
}

export const OPTIONS_SCORING_DEFAUT: Required<OptionsScoring> = {
  arbitrageB2cNewsletter: 'newsletter',
};

export interface ResultatScoring {
  /** Le lead est-il un lead entrant au sens des règles ? */
  eligible: boolean;
  /** Points comptabilisés dans l'objectif quanti (0 / 0,5 / 1). */
  points: number;
  /**
   * Le lead peut-il alimenter le compteur « leads activés / réactivés par
   * l'inbound » ? Faux pour les lead magnets issus d'une initiative outbound.
   */
  eligibleActivation: boolean;
  /** Identifiant stable de la règle appliquée (utilisé en base et en test). */
  regleId: string;
  /** Libellé lisible de la règle, affiché dans l'UI et poussé dans Notion. */
  regleLabel: string;
  /** Explication en une phrase, affichée au survol dans le tableau. */
  explication: string;
}

interface Regle {
  id: string;
  label: string;
  /** Condition d'application. */
  test: (e: EntreeScoring, o: Required<OptionsScoring>) => boolean;
  resultat: (e: EntreeScoring) => Omit<ResultatScoring, 'regleId' | 'regleLabel'>;
}

const estOutbound = (initiative: Initiative) => INITIATIVES_OUTBOUND.includes(initiative);

/**
 * Règles évaluées dans l'ordre. Les exclusions passent en premier : un
 * distributeur ou un client ne devient jamais un lead entrant, quelle que soit
 * l'initiative qui l'a touché.
 */
export const REGLES: readonly Regle[] = [
  {
    id: 'exclusion.renouvellement',
    label: 'Exclu — renouvellement client',
    test: (e) => e.typeDemande === 'renouvellement_client',
    resultat: () => ({
      eligible: false,
      points: 0,
      eligibleActivation: false,
      explication:
        "Un renouvellement client n'est pas un lead entrant : il ne compte ni en points ni en activation.",
    }),
  },
  {
    id: 'exclusion.distributeur',
    label: 'Exclu — distributeur existant',
    test: (e) => e.relation === 'distributeur',
    resultat: () => ({
      eligible: false,
      points: 0,
      eligibleActivation: false,
      explication:
        "Un distributeur existant n'est pas un prospect entrant (cas explicite du téléchargement de fiche technique).",
    }),
  },
  {
    id: 'exclusion.client',
    label: 'Exclu — compte déjà client',
    test: (e) => e.relation === 'client',
    resultat: () => ({
      eligible: false,
      points: 0,
      eligibleActivation: false,
      explication:
        'Les règles ne retiennent que les prospects « ni client, ni distributeur existant ».',
    }),
  },
  {
    id: 'outbound.lead_magnet',
    label: 'Lead magnet poussé en outbound',
    test: (e) => estOutbound(e.initiative),
    resultat: () => ({
      eligible: true,
      points: 0.5,
      eligibleActivation: false,
      explication:
        "Lead magnet servi par une initiative outbound (campagne ou BDR) : 0,5 point, et exclu des leads activés / réactivés par l'inbound.",
    }),
  },
  {
    id: 'newsletter.lead_magnet',
    label: 'Lead magnet poussé en newsletter',
    test: (e, o) =>
      e.initiative === 'newsletter' &&
      !(o.arbitrageB2cNewsletter === 'segment' && e.segment === 'b2c'),
    resultat: () => ({
      eligible: true,
      points: 1,
      eligibleActivation: true,
      explication:
        "Initiative issue exclusivement du pôle Growth (newsletter) : le lead compte pour 1 point plein.",
    }),
  },
  {
    id: 'inbound.b2c',
    label: 'Demande entrante B2C',
    test: (e) => e.segment === 'b2c',
    resultat: () => ({
      eligible: true,
      points: 0.5,
      eligibleActivation: true,
      explication: 'Demande entrante d’un prospect B2C : 0,5 point.',
    }),
  },
  {
    id: 'inbound.b2b',
    label: 'Demande entrante B2B / collectivité',
    test: () => true,
    resultat: () => ({
      eligible: true,
      points: 1,
      eligibleActivation: true,
      explication:
        'Demande entrante d’un prospect B2B ou collectivité non client (formulaire, fiche technique, livre blanc, catalogue, simulateur, appel entrant) : 1 point.',
    }),
  },
];

/** Applique les règles à un lead et renvoie son score justifié. */
export function scorerLead(entree: EntreeScoring, options: OptionsScoring = {}): ResultatScoring {
  const opts = { ...OPTIONS_SCORING_DEFAUT, ...options };
  for (const regle of REGLES) {
    if (regle.test(entree, opts)) {
      return { ...regle.resultat(entree), regleId: regle.id, regleLabel: regle.label };
    }
  }
  // Inatteignable : la dernière règle est un catch-all. Garde-fou explicite.
  throw new Error(`Aucune règle de scoring applicable : ${JSON.stringify(entree)}`);
}

/**
 * Points effectivement comptabilisés pour un lead, en tenant compte d'un
 * éventuel arbitrage manuel (un lead peut être forcé par le Growth Manager).
 */
export function pointsEffectifs(params: {
  points: number;
  pointsOverride?: number | null;
}): number {
  return params.pointsOverride ?? params.points;
}

/** Pas d'incrément autorisé pour un override manuel : 0 / 0,5 / 1. */
export const POINTS_AUTORISES = [0, 0.5, 1] as const;
