import { describe, expect, it } from 'vitest';
import { formaterMoisAnnee } from './format';

describe('formaterMoisAnnee', () => {
  it('affiche une catégorie mensuelle française stable', () => {
    expect(formaterMoisAnnee('2026-09-27')).toBe('Septembre 2026');
    expect(formaterMoisAnnee('2026-10-05')).toBe('Octobre 2026');
  });
});
