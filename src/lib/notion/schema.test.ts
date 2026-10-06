import { describe, expect, it } from 'vitest';
import type { Lead } from '@/lib/domain/lead';
import { P, P_SUIVI, depuisPageNotion, versProprietesNotion } from './schema';

const lead: Lead = {
  id: 'lead-1',
  dateReception: '2026-10-05',
  nom: 'Marie Dupont',
  email: 'marie@mairie-lyon.fr',
  telephone: '0612345678',
  societe: 'Mairie de Lyon',
  fonction: null,
  ville: 'Lyon',
  segment: 'collectivite',
  relation: 'prospect',
  typeDemande: 'simulateur',
  initiative: 'inbound_site',
  sourceCollecte: 'slack_inbound',
  campagne: null,
  leadMagnet: 'Simulateur collectivités',
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
  regleLabel: 'Demande entrante',
  explication: '',
  pointsOverride: null,
  pointsOverrideRaison: null,
  validationRequise: true,
  pointsConfirmes: true,
  pointsConfirmesLe: null,
  pointsConfirmesPar: null,
  aVerifier: false,
  confiance: 0.95,
  dedupeKey: null,
  notionPageId: null,
  notionLastSyncedAt: null,
  rawPayload: null,
  createdAt: '2026-10-05T08:00:00.000Z',
  updatedAt: '2026-10-05T08:00:00.000Z',
};

describe('schéma Notion Suivi des leads', () => {
  it('écrit les colonnes de la vue AirFit sans écraser les champs d’opportunité', () => {
    const props = versProprietesNotion(lead) as Record<string, Record<string, unknown>>;

    expect(props[P_SUIVI.annee]?.select).toEqual({ name: '2026' });
    expect(props[P_SUIVI.quarter]?.select).toEqual({ name: 'Q4' });
    expect(props[P_SUIVI.initiative]?.select).toEqual({ name: 'InBound' });
    expect(props[P_SUIVI.secteur]?.select).toEqual({ name: 'Collectivité Publique' });
    expect(props[P_SUIVI.canal]?.select).toEqual({ name: 'Site internet' });
    expect(props[P_SUIVI.issuGrowth]?.checkbox).toBe(true);
    expect(props[P.typeActivation]).toBeUndefined();
    expect(props[P.dateActivation]).toBeUndefined();
    expect(props[P.proprietaire]).toBeUndefined();
  });

  it('fait redescendre une opportunité Notion liée au pipeline', () => {
    const { patch } = depuisPageNotion({
      last_edited_time: '2026-10-12T09:30:00.000Z',
      properties: {
        '': { type: 'title', title: [{ plain_text: 'Ville de Lyon' }] },
        [P_SUIVI.initiative]: { select: { name: 'InBound' } },
        [P_SUIVI.secteur]: { select: { name: 'Collectivité Publique' } },
        [P_SUIVI.canal]: { select: { name: 'Site internet' } },
        [P_SUIVI.sourceProspect]: { rich_text: [{ plain_text: 'Simulateur collectivités' }] },
        [P.typeActivation]: { select: { name: 'Réactivation' } },
        [P_SUIVI.pipeline]: { relation: [{ id: 'opportunite-1' }] },
        [P_SUIVI.salesResponsable]: { people: [{ id: 'u1', name: 'Alice Sales' }] },
      },
    });

    expect(patch).toMatchObject({
      nom: 'Ville de Lyon',
      societe: 'Ville de Lyon',
      segment: 'collectivite',
      initiative: 'inbound_site',
      typeDemande: 'formulaire_contact',
      leadMagnet: 'Simulateur collectivités',
      proprietaire: 'Alice Sales',
      typeActivation: 'reactivation',
      statut: 'reactive',
      dateActivation: '2026-10-12',
      aVerifier: false,
    });
  });

  it('transforme Création d’orga en activation tout en conservant le signal', () => {
    const { patch } = depuisPageNotion({
      last_edited_time: '2026-10-20T10:00:00.000Z',
      properties: {
        [P.nom]: { type: 'title', title: [{ plain_text: 'Nouvelle organisation' }] },
        [P.typeActivation]: { select: { name: "Création d'orga" } },
      },
    });

    expect(patch.typeActivation).toBe('activation');
    expect(patch.statut).toBe('active');
    expect(patch.tags).toContain("Création d'orga");
  });
});
