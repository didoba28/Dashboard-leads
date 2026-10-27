import { describe, expect, it } from 'vitest';
import { calculerKpis, construireStats } from './analytics';
import type { Lead } from './domain/lead';
import { OBJECTIF_DEFAUT } from './domain/objectives';
import { construirePeriode } from './domain/periods';

function lead(patch: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1', dateReception: '2026-09-28', nom: 'Contact', email: 'contact@ville.fr',
    telephone: null, societe: 'Ville', fonction: null, ville: 'Lyon', segment: 'collectivite',
    relation: 'prospect', typeDemande: 'simulateur', initiative: 'inbound_site', sourceCollecte: 'slack_inbound',
    campagne: null, leadMagnet: 'Simulateur', message: null, statut: 'active', typeActivation: 'activation',
    dateActivation: '2026-10-06', proprietaire: 'Alice', tags: [], eligible: true, points: 1,
    eligibleActivation: true, regleId: 'inbound.b2b', regleLabel: 'Demande', explication: '',
    pointsOverride: null, pointsOverrideRaison: null, validationRequise: true, pointsConfirmes: true,
    pointsConfirmesLe: '2026-09-28T10:00:00Z', pointsConfirmesPar: 'Alice', aVerifier: false,
    confiance: 0.95, dedupeKey: null, notionPageId: null, notionLastSyncedAt: null, rawPayload: null,
    createdAt: '2026-09-28T09:00:00Z', updatedAt: '2026-10-06T09:00:00Z', ...patch,
  };
}

describe('indicateurs cohorte et flux d’activation', () => {
  it('compte une réactivation manuelle datée malgré un ancien statut et une exclusion des nouveaux leads', () => {
    const reactive = lead({ statut: 'qualifie', relation: 'client', eligible: false, eligibleActivation: false,
      points: 0, typeActivation: 'reactivation', manualFields: ['typeActivation', 'dateActivation'] });
    const kpis = calculerKpis([reactive], [reactive], construirePeriode('2026-Q4'));
    expect(kpis.reactivations).toBe(1);
    expect(kpis.opportunites).toBe(1);
    expect(kpis.points).toBe(0);
    expect(kpis.tauxActivation).toBe(0);
  });

  it('ne confond pas une proposition automatique avec une décision manuelle', () => {
    const reactive = lead({ statut: 'nouveau', typeActivation: 'reactivation', eligibleActivation: false });
    expect(calculerKpis([reactive]).reactivations).toBe(0);
    expect(calculerKpis([lead({ ...reactive, manualFields: ['typeActivation', 'dateActivation'], pointsConfirmes: false })]).reactivations).toBe(0);
  });

  it('respecte le type manuel même si le statut dit l’inverse, y compris un effacement explicite', () => {
    const choisi = lead({ statut: 'reactive', typeActivation: 'activation', manualFields: ['typeActivation', 'dateActivation'] });
    expect(calculerKpis([choisi]).activations).toBe(1);
    expect(calculerKpis([choisi]).reactivations).toBe(0);
    expect(calculerKpis([lead({ ...choisi, typeActivation: null })]).opportunites).toBe(0);
    expect(calculerKpis([lead({ ...choisi, dateActivation: null })]).opportunites).toBe(0);
  });

  it('rattache les points à la réception et l’opportunité à son activation', () => {
    const ancien = lead();
    const t3 = construireStats({
      leads: [ancien], leadsPeriodePrecedente: [], leadsActivations: [ancien],
      objectif: { ...OBJECTIF_DEFAUT, periode: '2026-Q3' },
    });
    const t4 = construireStats({
      leads: [], leadsPeriodePrecedente: [ancien], leadsActivations: [ancien],
      objectif: { ...OBJECTIF_DEFAUT, periode: '2026-Q4' },
    });
    expect(t3.kpis.points).toBe(1);
    expect(t3.kpis.opportunites).toBe(0);
    expect(t4.kpis.points).toBe(0);
    expect(t4.kpis.opportunites).toBe(1);
    expect(t4.serie.reduce((n, semaine) => n + semaine.opportunites, 0)).toBe(1);
    expect(t4.comparaison.opportunites).toBe(0);
  });

  it('ne mélange pas le numérateur flux avec le dénominateur cohorte', () => {
    const nouveau = lead({ id: 'nouveau', dateReception: '2026-10-05', statut: 'nouveau', dateActivation: null });
    const kpis = calculerKpis([nouveau], [lead()], construirePeriode('2026-Q4'));
    expect(kpis.opportunites).toBe(1);
    expect(kpis.opportunitesCohorte).toBe(0);
    expect(kpis.tauxActivation).toBe(0);
    expect(kpis.opportunitesSansDate).toBe(0);
  });

  it('rend explicites les activations sans date au lieu de les attribuer au hasard', () => {
    const kpis = calculerKpis([lead({ dateActivation: null })]);
    expect(kpis.opportunites).toBe(0);
    expect(kpis.opportunitesSansDate).toBe(1);
    expect(kpis.tauxActivation).toBe(0);
  });

  it('ne compte qu’une fois une activation confirmée et respecte les réactivations', () => {
    const reactive = lead({ statut: 'reactive', typeActivation: 'reactivation' });
    const kpis = calculerKpis([], [reactive, reactive, lead({ id: 'non-confirme', pointsConfirmes: false })]);
    expect(kpis.opportunites).toBe(1);
    expect(kpis.reactivations).toBe(1);
    expect(kpis.activations).toBe(0);
  });

  it('un arbitrage à zéro ne peut faire dépasser le taux de cohorte', () => {
    const kpis = calculerKpis([lead({ pointsOverride: 0 })]);
    expect(kpis.leadsEligibles).toBe(0);
    expect(kpis.opportunitesCohorte).toBe(0);
    expect(kpis.tauxActivation).toBe(0);
  });
});
