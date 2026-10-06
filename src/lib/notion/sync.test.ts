import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pages: vi.fn(), parsed: vi.fn(), get: vi.fn(), run: vi.fn(),
  lireReglages: vi.fn(), ecrireReglages: vi.fn(),
  lireLead: vi.fn(), lireParNotion: vi.fn(), creer: vi.fn(), maj: vi.fn(), marque: vi.fn(), aPousser: vi.fn(),
  pageCreate: vi.fn(), pageUpdate: vi.fn(),
}));

vi.mock('@notionhq/client', () => ({ collectPaginatedAPI: mocks.pages, isFullPage: () => true }));
vi.mock('./client', () => ({
  notionEstConfigure: () => true,
  getNotion: () => ({ dataSources: { query: vi.fn() }, pages: { create: mocks.pageCreate, update: mocks.pageUpdate } }),
}));
vi.mock('./schema', () => ({ P: { tags: 'Tags' }, PROPRIETES: {}, depuisPageNotion: mocks.parsed, versProprietesNotion: () => ({}) }));
vi.mock('@/lib/db', () => ({ getDb: async () => ({ get: mocks.get, run: mocks.run }), maintenantIso: () => '2026-10-06T09:00:00Z', nouvelId: () => 'journal-1' }));
vi.mock('@/lib/db/settings', () => ({ lireReglages: mocks.lireReglages, ecrireReglages: mocks.ecrireReglages }));
vi.mock('@/lib/db/leads', () => ({
  lireLead: mocks.lireLead, lireLeadParNotionPageId: mocks.lireParNotion,
  creerLead: mocks.creer, mettreAJourLead: mocks.maj, marquerSynchronise: mocks.marque, leadsAPousser: mocks.aPousser,
}));

import { pullDepuisNotion, pushVersNotion, synchroniser } from './sync';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NOTION_DATABASE_ID', 'base-1');
  mocks.lireReglages.mockResolvedValue({ notionDatabaseId: 'base-1', notionDataSourceId: 'source-1', notionDernierPull: '2026-10-05T09:00:00Z' });
  mocks.pages.mockResolvedValue([{ id: 'page-1', properties: {}, last_edited_time: '2026-10-06T08:00:00Z' }]);
  mocks.parsed.mockReturnValue({ patch: { segment: 'collectivite', typeDemande: 'simulateur' }, idDashboard: 'lead-1' });
  mocks.get.mockResolvedValue(undefined);
  mocks.creer.mockResolvedValue({ lead: { id: 'lead-1' }, doublon: false });
  mocks.aPousser.mockResolvedValue([]);
});

describe('sécurité de la synchronisation Notion', () => {
  it('ne recrée jamais un lead archivé localement', async () => {
    mocks.get.mockResolvedValue({ id: 'lead-archive' });
    const resultat = await pullDepuisNotion();
    expect(resultat).toMatchObject({ succes: true, ignores: 1, crees: 0 });
    expect(mocks.creer).not.toHaveBeenCalled();
    expect(mocks.maj).not.toHaveBeenCalled();
    expect(mocks.get.mock.calls[0]?.[1]).toEqual(['page-1', 'lead-1']);
  });

  it('ne dépasse pas une page échouée avec le curseur de synchronisation', async () => {
    mocks.creer.mockRejectedValue(new Error('Erreur temporaire de page'));
    const resultat = await pullDepuisNotion();
    expect(resultat.succes).toBe(false);
    expect(resultat.erreurs[0]).toContain('Page page-1');
    expect(mocks.ecrireReglages).not.toHaveBeenCalled();
  });

  it('avance le curseur seulement après un pull intégralement réussi', async () => {
    const resultat = await pullDepuisNotion();
    expect(resultat).toMatchObject({ succes: true, crees: 1 });
    expect(mocks.ecrireReglages).toHaveBeenCalledWith({ notionDernierPull: '2026-10-06T09:00:00Z' });
  });

  it('signale un échec partiel lors du push plutôt que de présenter un succès', async () => {
    mocks.aPousser.mockResolvedValue([{ id: 'lead-1', notionPageId: null }]);
    mocks.pageCreate.mockRejectedValue(new Error('Notion indisponible'));
    const resultat = await pushVersNotion();
    expect(resultat.succes).toBe(false);
    expect(resultat.erreurs[0]).toContain('Lead lead-1');
    expect(mocks.marque).not.toHaveBeenCalled();
  });

  it('n’envoie rien vers Notion si la lecture a échoué', async () => {
    mocks.creer.mockRejectedValue(new Error('E-mail Notion invalide'));
    const resultat = await synchroniser();
    expect(resultat).toMatchObject({ succes: false, direction: 'bidirectionnel' });
    expect(mocks.aPousser).not.toHaveBeenCalled();
    expect(mocks.pageCreate).not.toHaveBeenCalled();
    expect(mocks.pageUpdate).not.toHaveBeenCalled();
  });

  it('complète les tags locaux avec le signal pipeline si Notion ne possède pas la colonne Tags', async () => {
    mocks.lireParNotion.mockResolvedValue({
      id: 'lead-1', tags: ['Prioritaire', 'Île-de-France'], aVerifier: false,
      dateActivation: '2026-10-02', notionLastSyncedAt: '2026-10-04T08:00:00Z',
      updatedAt: '2026-10-05T08:00:00Z',
    });
    mocks.parsed.mockReturnValue({
      patch: { tags: ["Création d'orga"], statut: 'active', typeActivation: 'activation' },
      idDashboard: 'lead-1',
    });
    const resultat = await pullDepuisNotion();
    expect(resultat).toMatchObject({ succes: true, maj: 1 });
    expect(mocks.maj).toHaveBeenCalledWith('lead-1', expect.objectContaining({
      tags: ['Prioritaire', 'Île-de-France', "Création d'orga"],
    }));
  });

  it('respecte les tags explicitement modifiés dans une colonne Tags présente', async () => {
    mocks.pages.mockResolvedValue([{ id: 'page-1', properties: { Tags: {} }, last_edited_time: '2026-10-06T08:00:00Z' }]);
    mocks.lireParNotion.mockResolvedValue({
      id: 'lead-1', tags: ['Ancien tag'], notionLastSyncedAt: '2026-10-04T08:00:00Z',
      updatedAt: '2026-10-05T08:00:00Z',
    });
    mocks.parsed.mockReturnValue({ patch: { tags: ['Nouveau tag'] }, idDashboard: 'lead-1' });
    const resultat = await pullDepuisNotion();
    expect(resultat).toMatchObject({ succes: true, maj: 1 });
    expect(mocks.maj).toHaveBeenCalledWith('lead-1', expect.objectContaining({ tags: ['Nouveau tag'] }));
  });
});
