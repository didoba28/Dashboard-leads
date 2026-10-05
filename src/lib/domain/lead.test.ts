import { describe, expect, it } from 'vitest';
import { calculerDedupeKey, pointsDuLead, pointsProposesDuLead, schemaLeadInput, type Lead } from './lead';

const leadBase: Lead = {
  id: 'l1',
  dateReception: '2026-10-05',
  nom: 'Marie Dupont',
  email: 'm@mairie-lyon.fr',
  telephone: null,
  societe: 'Mairie de Lyon',
  fonction: null,
  ville: 'Lyon',
  segment: 'collectivite',
  relation: 'prospect',
  typeDemande: 'fiche_technique',
  initiative: 'inbound_site',
  sourceCollecte: 'email_formulaire',
  campagne: null,
  leadMagnet: 'Fiche technique X',
  message: null,
  statut: 'nouveau',
  typeActivation: null,
  dateActivation: null,
  proprietaire: null,
  tags: [],
  eligible: true,
  points: 1,
  eligibleActivation: true,
  regleId: 'inbound.b2b',
  regleLabel: 'Demande entrante B2B / collectivité',
  explication: '',
  pointsOverride: null,
  pointsOverrideRaison: null,
  validationRequise: false,
  pointsConfirmes: true,
  pointsConfirmesLe: null,
  pointsConfirmesPar: null,
  aVerifier: false,
  confiance: 0.9,
  dedupeKey: null,
  notionPageId: null,
  notionLastSyncedAt: null,
  rawPayload: null,
  createdAt: '2026-10-05T08:00:00.000Z',
  updatedAt: '2026-10-05T08:00:00.000Z',
};

describe('pointsDuLead', () => {
  it('utilise le score calculé par défaut', () => {
    expect(pointsDuLead(leadBase)).toBe(1);
  });

  it('respecte un arbitrage manuel', () => {
    expect(pointsDuLead({ ...leadBase, pointsOverride: 0.5 })).toBe(0.5);
  });

  it('permet de forcer à 0', () => {
    expect(pointsDuLead({ ...leadBase, pointsOverride: 0 })).toBe(0);
  });

  it('renvoie 0 pour un lead non éligible sans arbitrage', () => {
    expect(pointsDuLead({ ...leadBase, eligible: false, points: 0 })).toBe(0);
  });

  it('permet de rattraper manuellement un lead jugé non éligible', () => {
    expect(pointsDuLead({ ...leadBase, eligible: false, points: 0, pointsOverride: 1 })).toBe(1);
  });

  it('ne comptabilise pas une proposition tant qu’elle n’est pas confirmée', () => {
    const enAttente = { ...leadBase, validationRequise: true, pointsConfirmes: false };
    expect(pointsProposesDuLead(enAttente)).toBe(1);
    expect(pointsDuLead(enAttente)).toBe(0);
  });
});

describe('calculerDedupeKey', () => {
  it('identifie deux fois le même téléchargement le même jour', () => {
    const a = calculerDedupeKey({
      email: 'Marie.Dupont@Mairie-Lyon.fr',
      typeDemande: 'fiche_technique',
      leadMagnet: 'Fiche technique X',
      dateReception: '2026-10-05',
    });
    const b = calculerDedupeKey({
      email: 'marie.dupont@mairie-lyon.fr ',
      typeDemande: 'fiche_technique',
      leadMagnet: 'fiche technique x',
      dateReception: '2026-10-05',
    });
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it('distingue deux ressources différentes', () => {
    const a = calculerDedupeKey({ email: 'a@b.fr', typeDemande: 'catalogue', leadMagnet: 'Catalogue 2026', dateReception: '2026-10-05' });
    const b = calculerDedupeKey({ email: 'a@b.fr', typeDemande: 'catalogue', leadMagnet: 'Catalogue 2025', dateReception: '2026-10-05' });
    expect(a).not.toBe(b);
  });

  it('retombe sur le téléphone puis la société', () => {
    expect(calculerDedupeKey({ telephone: '06 12 34 56 78', typeDemande: 'appel_entrant', dateReception: '2026-10-05' })).toBe(
      '0612345678|appel_entrant|2026-10-05',
    );
    expect(calculerDedupeKey({ societe: 'Mairie de Lyon', typeDemande: 'catalogue', dateReception: '2026-10-05' })).toContain('mairiedelyon');
  });

  it('renvoie null sans identité exploitable', () => {
    expect(calculerDedupeKey({ typeDemande: 'catalogue', dateReception: '2026-10-05' })).toBeNull();
  });
});

describe('schemaLeadInput', () => {
  it('normalise les champs vides en null et l’e-mail en minuscules', () => {
    const r = schemaLeadInput.parse({
      segment: 'b2b',
      typeDemande: 'demande_prix',
      email: 'Contact@ACME.fr',
      societe: '  ',
    });
    expect(r.email).toBe('contact@acme.fr');
    expect(r.societe).toBeNull();
    expect(r.relation).toBe('prospect');
    expect(r.initiative).toBe('inbound_site');
    expect(r.tags).toEqual([]);
  });

  it('rejette un e-mail invalide', () => {
    const r = schemaLeadInput.safeParse({ segment: 'b2b', typeDemande: 'demande_prix', email: 'nope' });
    expect(r.success).toBe(false);
  });

  it('rejette un segment inconnu', () => {
    expect(schemaLeadInput.safeParse({ segment: 'b2g', typeDemande: 'demande_prix' }).success).toBe(false);
  });

  it('refuse un arbitrage de points hors 0 / 0,5 / 1', () => {
    expect(
      schemaLeadInput.safeParse({ segment: 'b2b', typeDemande: 'demande_prix', pointsOverride: 0.75 }).success,
    ).toBe(false);
  });

  it('rejette une date de réception mal formée', () => {
    expect(
      schemaLeadInput.safeParse({ segment: 'b2b', typeDemande: 'demande_prix', dateReception: '05/10/2026' }).success,
    ).toBe(false);
  });
});
