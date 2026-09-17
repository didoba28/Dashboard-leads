import { describe, expect, it } from 'vitest';
import {
  OBJECTIF_DEFAUT,
  calculerPrime,
  rythmeRequis,
  synthetiserObjectif,
  type Objectif,
} from './objectives';

const objectif: Objectif = { periode: '2026-Q4', ...OBJECTIF_DEFAUT };

describe('calculerPrime — volume de points', () => {
  it('ne verse rien sous le seuil', () => {
    const r = calculerPrime(59.5, objectif.paliersPoints);
    expect(r.montant).toBe(0);
    expect(r.palierSuivant?.seuil).toBe(60);
    expect(r.restePourPalierSuivant).toBe(0.5);
  });

  it('verse 200 € à 60 points', () => {
    expect(calculerPrime(60, objectif.paliersPoints).montant).toBe(200);
  });

  it('plafonne au-delà du seuil sans prime marginale', () => {
    expect(calculerPrime(120, objectif.paliersPoints).montant).toBe(200);
  });
});

describe('calculerPrime — paliers d’activation', () => {
  const p = objectif.paliersActivation;
  const extra = objectif.primeParOpportuniteSupplementaire;

  it.each([
    [0, 0],
    [14, 0],
    [15, 200],
    [19, 200],
    [20, 300],
    [24, 300],
    [25, 400],
    [26, 420],
    [30, 500],
  ])('%i opportunités → %i €', (opportunites, attendu) => {
    expect(calculerPrime(opportunites, p, extra).montant).toBe(attendu);
  });

  it('détaille le supplément au-delà du dernier palier', () => {
    const r = calculerPrime(28, p, extra);
    expect(r.palierAtteint?.seuil).toBe(25);
    expect(r.supplement).toEqual({ unites: 3, montant: 60 });
    expect(r.palierSuivant).toBeNull();
  });

  it('indique ce qu’il reste pour le palier suivant', () => {
    const r = calculerPrime(17, p, extra);
    expect(r.palierSuivant?.seuil).toBe(20);
    expect(r.restePourPalierSuivant).toBe(3);
  });

  it('gère une grille de paliers vide', () => {
    expect(calculerPrime(100, []).montant).toBe(0);
  });

  it('ne dépend pas de l’ordre de saisie des paliers', () => {
    const desordre = [...p].reverse();
    expect(calculerPrime(22, desordre, extra).montant).toBe(calculerPrime(22, p, extra).montant);
  });
});

describe('synthetiserObjectif', () => {
  it('cumule les deux dispositifs de prime', () => {
    const s = synthetiserObjectif({ objectif, points: 62, opportunites: 20, avancement: 1 });
    expect(s.primePoints.montant).toBe(200);
    expect(s.primeActivation.montant).toBe(300);
    expect(s.primeTotale).toBe(500);
  });

  it('projette à rythme constant', () => {
    const s = synthetiserObjectif({ objectif, points: 30, opportunites: 8, avancement: 0.5 });
    expect(s.projectionPoints).toBe(60);
    expect(s.projectionOpportunites).toBe(16);
  });

  it('ne projette pas avant le début de la période', () => {
    const s = synthetiserObjectif({ objectif, points: 0, opportunites: 0, avancement: 0 });
    expect(s.projectionPoints).toBe(0);
    expect(s.progressionPoints).toBe(0);
  });

  it('borne l’avancement entre 0 et 1', () => {
    const s = synthetiserObjectif({ objectif, points: 10, opportunites: 2, avancement: 5 });
    expect(s.projectionPoints).toBe(10);
  });
});

describe('rythmeRequis', () => {
  it('calcule le rythme hebdomadaire nécessaire', () => {
    expect(rythmeRequis({ cible: 60, realise: 20, joursRestants: 40 })).toBe(7);
  });

  it('renvoie le reste brut si la période est terminée', () => {
    expect(rythmeRequis({ cible: 60, realise: 50, joursRestants: 0 })).toBe(10);
  });

  it('ne renvoie jamais de valeur négative', () => {
    expect(rythmeRequis({ cible: 60, realise: 80, joursRestants: 10 })).toBe(0);
  });
});
