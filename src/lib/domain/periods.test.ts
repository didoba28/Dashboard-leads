import { describe, expect, it } from 'vitest';
import {
  avancementPeriode,
  construirePeriode,
  estIdPeriodeValide,
  joursRestants,
  periodeDepuisDate,
  periodesAutour,
} from './periods';

describe('periodeDepuisDate', () => {
  it.each([
    ['2026-01-01', '2026-Q1'],
    ['2026-03-31', '2026-Q1'],
    ['2026-04-01', '2026-Q2'],
    ['2026-09-30', '2026-Q3'],
    ['2026-10-01', '2026-Q4'],
    ['2026-12-31', '2026-Q4'],
  ])('%s → %s', (date, attendu) => {
    expect(periodeDepuisDate(date)).toBe(attendu);
  });

  it('rejette une date invalide', () => {
    expect(() => periodeDepuisDate('pas-une-date')).toThrow(/Date invalide/);
  });
});

describe('construirePeriode', () => {
  it('borne correctement le T4 2026', () => {
    const p = construirePeriode('2026-Q4');
    expect(p).toMatchObject({ annee: 2026, trimestre: 4, debut: '2026-10-01', fin: '2026-12-31', label: 'T4 2026' });
  });

  it('gère une année bissextile sur le T1', () => {
    expect(construirePeriode('2024-Q1').fin).toBe('2024-03-31');
  });

  it('rejette un identifiant invalide', () => {
    expect(() => construirePeriode('2026-Q5')).toThrow(/Période invalide/);
    expect(estIdPeriodeValide('2026-Q5')).toBe(false);
    expect(estIdPeriodeValide('2026-Q4')).toBe(true);
  });
});

describe('periodesAutour', () => {
  it('traverse correctement les années', () => {
    const ids = periodesAutour('2026-Q1', 2, 1).map((p) => p.id);
    expect(ids).toEqual(['2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2']);
  });
});

describe('avancementPeriode', () => {
  it('vaut 0 avant le début', () => {
    expect(avancementPeriode('2026-Q4', new Date('2026-09-01T00:00:00Z'))).toBe(0);
  });

  it('vaut 1 après la fin', () => {
    expect(avancementPeriode('2026-Q4', new Date('2027-01-05T00:00:00Z'))).toBe(1);
  });

  it('est proche de 0,5 au milieu du trimestre', () => {
    const a = avancementPeriode('2026-Q4', new Date('2026-11-15T12:00:00Z'));
    expect(a).toBeGreaterThan(0.45);
    expect(a).toBeLessThan(0.55);
  });
});

describe('joursRestants', () => {
  it('compte les jours jusqu’à la fin de période', () => {
    expect(joursRestants('2026-Q4', new Date('2026-12-21T00:00:00Z'))).toBe(11);
  });

  it('ne descend pas sous zéro', () => {
    expect(joursRestants('2026-Q4', new Date('2027-03-01T00:00:00Z'))).toBe(0);
  });
});
