import { describe, expect, it } from 'vitest';
import type { Lead } from './lead';
import { aOrigineDetaillee, construirePilotage, lienLeads } from './pilotage';

function lead(changements: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1', dateReception: '2026-10-05', nom: 'Marie Dupont', email: 'contact@mairie.fr',
    telephone: null, societe: 'Mairie', fonction: null, ville: 'Lyon', segment: 'collectivite',
    relation: 'prospect', typeDemande: 'formulaire_contact', initiative: 'inbound_site',
    sourceCollecte: 'slack_inbound', campagne: null, leadMagnet: null, message: null,
    statut: 'nouveau', typeActivation: null, dateActivation: null, proprietaire: 'Adel', tags: [],
    eligible: true, points: 1, eligibleActivation: true, regleId: 'inbound.b2b', regleLabel: 'Inbound',
    explication: '', pointsOverride: null, pointsOverrideRaison: null, validationRequise: false,
    pointsConfirmes: true, pointsConfirmesLe: null, pointsConfirmesPar: null, aVerifier: false,
    confiance: 0.95, dedupeKey: null, notionPageId: null, notionLastSyncedAt: null, rawPayload: null,
    createdAt: '2026-10-05T10:00:00Z', updatedAt: '2026-10-05T10:00:00Z', ...changements,
  };
}

describe('construirePilotage', () => {
  it('conserve les bornes exactes du trimestre et affiche les mois vides', () => {
    const resultat = construirePilotage({ periode: '2026-Q4', aujourdhui: '2026-10-06', leads: [
      lead({ id: 'avant', dateReception: '2026-09-30' }),
      lead({ id: 'debut', dateReception: '2026-10-01' }),
      lead({ id: 'fin', dateReception: '2026-12-31' }),
      lead({ id: 'apres', dateReception: '2027-01-01' }),
    ] });
    expect(resultat.recus).toBe(2);
    expect(resultat.mois.map((m) => [m.mois, m.recus, m.fin])).toEqual([
      ['2026-10', 1, '2026-10-31'], ['2026-11', 0, '2026-11-30'], ['2026-12', 1, '2026-12-31'],
    ]);
  });

  it('réconcilie reçus, confirmés comptabilisés, propositions et exclusions avec les arbitrages', () => {
    const resultat = construirePilotage({ periode: '2026-Q4', aujourdhui: '2026-10-06', leads: [
      lead({ id: 'valide', pointsOverride: 0.5 }),
      lead({ id: 'propose', pointsConfirmes: false, pointsOverride: 0.5 }),
      lead({ id: 'exclu', pointsOverride: 0 }),
      lead({ id: 'rattrape', eligible: false, points: 0, pointsOverride: 1 }),
    ] });
    expect(resultat.comptabilises).toBe(2);
    expect(resultat.enAttente).toBe(1);
    expect(resultat.exclus).toBe(1);
    expect(resultat.comptabilises + resultat.enAttente + resultat.exclus).toBe(resultat.recus);
    expect(resultat.pointsValides).toBe(1.5);
    expect(resultat.pointsProposes).toBe(0.5);
    expect(resultat.mois.reduce((total, m) => total + m.pointsValides, 0)).toBe(resultat.pointsValides);
  });

  it('mesure la présence des données sans confondre les signatures techniques avec le prospect', () => {
    const resultat = construirePilotage({ periode: '2026-Q4', aujourdhui: '2026-10-06', leads: [
      lead({ email: 'no-reply-forms@webflow.com', telephone: '+33 6 12 34 56 78' }),
    ] });
    expect(resultat.qualite.contacts).toBe(0);
    expect(resultat.qualite.completude).toBe(75);
    expect(resultat.qualite.dossiersComplets).toBe(0);
    expect(resultat.actions[0]?.raisons).toContain('Compléter un moyen de contact externe');
  });

  it('priorise la relecture puis les décisions anciennes, sans dupliquer un dossier', () => {
    const resultat = construirePilotage({ periode: '2026-Q4', aujourdhui: '2026-10-20', leads: [
      lead({ id: 'recent', dateReception: '2026-10-19', pointsConfirmes: false }),
      lead({ id: 'ancien', dateReception: '2026-10-02', pointsConfirmes: false, proprietaire: null }),
      lead({ id: 'relecture', dateReception: '2026-10-15', pointsConfirmes: false, aVerifier: true }),
    ] });
    expect(resultat.actions.map((a) => a.lead.id)).toEqual(['relecture', 'ancien', 'recent']);
    expect(resultat.totalActions).toBe(3);
    expect(resultat.enAttenteDepuis7Jours).toBe(1);
    expect(resultat.derniersLeads.map((a) => a.id)).toEqual(['recent', 'relecture', 'ancien']);
  });

  it('ne présente pas de taux de complétude artificiel sur une cohorte vide', () => {
    const resultat = construirePilotage({ periode: '2026-Q4', leads: [] });
    expect(resultat.qualite.completude).toBeNull();
    expect(resultat.actions).toEqual([]);
  });

  it('signale une activation non datée sans la confondre avec une décision en attente', () => {
    const resultat = construirePilotage({ periode: '2026-Q4', aujourdhui: '2026-10-06', leads: [
      lead({ statut: 'active', dateActivation: null }),
    ] });
    expect(resultat.enAttente).toBe(0);
    expect(resultat.actions[0]?.priorite).toBe('haute');
    expect(resultat.actions[0]?.raisons).toContain('Renseigner la date d’activation pour son rattachement à la période');
  });

  it('distingue validation des points et qualification commerciale du lead', () => {
    const resultat = construirePilotage({ periode: '2026-Q4', aujourdhui: '2026-10-06', leads: [lead()] });
    expect(resultat.enAttente).toBe(0);
    expect(resultat.aQualifier).toBe(1);
    expect(resultat.actions[0]?.raisons).toContain('Qualifier la demande commerciale');
  });
});

describe('origine détaillée et navigation', () => {
  it('exige les détails de ressource et de campagne uniquement quand ils sont applicables', () => {
    expect(aOrigineDetaillee(lead())).toBe(true);
    expect(aOrigineDetaillee(lead({ typeDemande: 'simulateur', leadMagnet: null }))).toBe(false);
    expect(aOrigineDetaillee(lead({ typeDemande: 'simulateur', leadMagnet: 'Simulateur collectivités' }))).toBe(true);
    expect(aOrigineDetaillee(lead({ initiative: 'outbound_campagne', campagne: null }))).toBe(false);
    expect(aOrigineDetaillee(lead({ initiative: 'inconnue' }))).toBe(false);
  });

  it('conserve période et plage exacte dans les liens mensuels', () => {
    const params = new URL(lienLeads('2026-Q4', { dateDebut: '2026-10-01', dateFin: '2026-10-31', pointsExclus: true }), 'https://dashboard.test').searchParams;
    expect(params.get('periode')).toBe('2026-Q4');
    expect(params.get('dateDebut')).toBe('2026-10-01');
    expect(params.get('dateFin')).toBe('2026-10-31');
    expect(params.get('pointsExclus')).toBe('true');
  });
});
