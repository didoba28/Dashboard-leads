import { describe, expect, it } from 'vitest';
import { evaluerValidationAutomatique, estEmailInterneAirfit } from './automation';

const base = {
  aVerifier: false,
  confiance: 0.95,
  email: 'lead@exemple.fr',
  telephone: null,
  sourceCollecte: 'slack_inbound' as const,
  typeDemande: 'simulateur' as const,
  leadMagnet: 'Simulateur collectivités',
};

describe('evaluerValidationAutomatique', () => {
  it('valide un lead automatisé fiable et explique pourquoi', () => {
    const decision = evaluerValidationAutomatique(base);
    expect(decision.valider).toBe(true);
    expect(decision.raisons.join(' ')).toContain('95 %');
    expect(decision.raisons.join(' ')).toContain('Simulateur collectivités');
  });

  it('bloque sous 90 %', () => {
    expect(evaluerValidationAutomatique({ ...base, confiance: 0.89 }).valider).toBe(false);
  });

  it('bloque un contact interne même avec une forte confiance', () => {
    const decision = evaluerValidationAutomatique({ ...base, email: 'adel@AIRFIT.CO' });
    expect(decision.valider).toBe(false);
    expect(decision.blocage).toContain('@airfit.co');
  });

  it('accepte un téléphone sans e-mail mais pas un lead sans contact', () => {
    expect(evaluerValidationAutomatique({ ...base, email: null, telephone: '+33 6 12 34 56 78' }).valider).toBe(true);
    expect(evaluerValidationAutomatique({ ...base, email: null, telephone: null }).valider).toBe(false);
  });

  it('ne confirme jamais une saisie manuelle', () => {
    expect(evaluerValidationAutomatique({ ...base, sourceCollecte: 'manuel' }).valider).toBe(false);
  });
});

describe('estEmailInterneAirfit', () => {
  it('reconnaît uniquement le domaine AirFit exact', () => {
    expect(estEmailInterneAirfit('prenom@airfit.co')).toBe(true);
    expect(estEmailInterneAirfit('prenom@notairfit.co')).toBe(false);
  });
});
