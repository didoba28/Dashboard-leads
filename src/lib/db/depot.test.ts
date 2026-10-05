/**
 * Tests d'intégration du dépôt de données : exécutés sur SQLite (toujours) et
 * sur PostgreSQL quand `TEST_DATABASE_URL` est défini (sinon ignorés via
 * `describe.skipIf`). Les mêmes cas de test tournent sur les deux pilotes —
 * `definirTests()` est factorisé pour ne pas dupliquer les assertions.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fermerDb, getDb } from './index';
import {
  creerLead,
  confirmerPointsLead,
  leadsAPousser,
  lireLead,
  listerLeads,
  listerTousLeads,
  marquerSynchronise,
  mettreAJourLead,
  rescorerTout,
  supprimerLead,
} from './leads';
import { ecrireObjectif, ecrireReglages, lireObjectif, lireReglages } from './settings';
import { pointsDuLead, pointsProposesDuLead, schemaLeadInput, type LeadParsed } from '@/lib/domain/lead';
import { OBJECTIF_DEFAUT } from '@/lib/domain/objectives';

function entreeLead(overrides: Record<string, unknown> = {}): LeadParsed {
  return schemaLeadInput.parse({
    dateReception: '2026-10-15',
    nom: 'Jean Dupont',
    email: 'jean.dupont@exemple.fr',
    societe: 'Mairie de Test',
    segment: 'b2b',
    relation: 'prospect',
    typeDemande: 'demande_prix',
    initiative: 'inbound_site',
    sourceCollecte: 'manuel',
    ...overrides,
  });
}

/** Vide les tables entre deux tests, quel que soit le pilote actif. */
async function viderBase(): Promise<void> {
  const db = await getDb();
  await db.exec('DELETE FROM leads; DELETE FROM objectifs; DELETE FROM reglages; DELETE FROM journal_sync;');
}

/** Enregistre le jeu de tests commun aux deux pilotes dans le `describe` englobant. */
function definirTests(): void {
  beforeEach(async () => {
    await viderBase();
  });

  it('applique le scoring à la création et le persiste (points, éligibilité, règle)', async () => {
    const { lead, doublon } = await creerLead(entreeLead());
    expect(doublon).toBe(false);
    expect(lead.points).toBe(1);
    expect(lead.eligible).toBe(true);
    expect(lead.regleId).toBe('inbound.b2b');
  });

  it('propose les points d’un lead automatisé puis les comptabilise après confirmation', async () => {
    const { lead } = await creerLead(entreeLead({ sourceCollecte: 'site_web' }), { validationRequise: true });
    expect(lead.validationRequise).toBe(true);
    expect(lead.pointsConfirmes).toBe(false);
    expect(pointsProposesDuLead(lead)).toBe(1);
    expect(pointsDuLead(lead)).toBe(0);
    expect((await listerLeads({ pointsConfirmes: false })).total).toBe(1);

    const confirme = await confirmerPointsLead(lead.id, 'adel@airfit.co');
    expect(confirme?.pointsConfirmes).toBe(true);
    expect(confirme?.pointsConfirmesPar).toBe('adel@airfit.co');
    expect(confirme?.pointsConfirmesLe).not.toBeNull();
    expect(pointsDuLead(confirme!)).toBe(1);
    expect((await listerLeads({ pointsConfirmes: false })).total).toBe(0);

    const modifie = await mettreAJourLead(lead.id, { relation: 'client' });
    expect(modifie?.pointsConfirmes).toBe(false);
    expect(modifie?.pointsConfirmesLe).toBeNull();
    expect(pointsDuLead(modifie!)).toBe(0);
  });

  it('re-score automatiquement à 0 point quand la relation passe à « client »', async () => {
    const { lead } = await creerLead(entreeLead());
    expect(lead.points).toBe(1);

    const maj = await mettreAJourLead(lead.id, { relation: 'client' });
    expect(maj?.points).toBe(0);
    expect(maj?.eligible).toBe(false);
    expect(maj?.regleId).toBe('exclusion.client');
  });

  it('déduplique deux créations identiques le même jour : la seconde ne crée rien', async () => {
    const entree = entreeLead({ email: 'doublon@exemple.fr' });
    const premier = await creerLead(entree);
    expect(premier.doublon).toBe(false);

    const second = await creerLead(entree);
    expect(second.doublon).toBe(true);
    expect(second.lead.id).toBe(premier.lead.id);

    const { total } = await listerLeads({});
    expect(total).toBe(1);
  });

  it('filtre par période, segment, statut, à-vérifier et recherche texte (insensible à la casse)', async () => {
    await creerLead(
      entreeLead({
        nom: 'Alice Martin',
        email: 'alice@exemple.fr',
        dateReception: '2026-10-05',
        segment: 'b2b',
        statut: 'nouveau',
      }),
    );
    await creerLead(
      entreeLead({
        nom: 'Bob Studio',
        email: 'bob@exemple.fr',
        dateReception: '2026-07-05',
        segment: 'b2c',
        statut: 'qualifie',
        aVerifier: true,
      }),
    );
    await creerLead(
      entreeLead({
        nom: 'Camille Rousseau',
        email: 'camille@exemple.fr',
        dateReception: '2026-10-20',
        segment: 'collectivite',
        statut: 'qualifie',
      }),
    );

    const { leads: t4 } = await listerLeads({ periode: '2026-Q4' });
    expect(t4.map((l) => l.nom).sort()).toEqual(['Alice Martin', 'Camille Rousseau']);

    const { leads: b2c } = await listerLeads({ segment: ['b2c'] });
    expect(b2c).toHaveLength(1);
    expect(b2c[0]?.nom).toBe('Bob Studio');

    const { leads: qualifies } = await listerLeads({ statut: ['qualifie'] });
    expect(qualifies).toHaveLength(2);

    const { leads: aVerifier } = await listerLeads({ aVerifier: true });
    expect(aVerifier).toHaveLength(1);
    expect(aVerifier[0]?.nom).toBe('Bob Studio');

    // Recherche en MAJUSCULES sur un nom stocké normalement : doit rester insensible à la casse
    // sur les deux pilotes (SQLite comme PostgreSQL — voir le commentaire dans leads.ts).
    const { leads: recherche } = await listerLeads({ q: 'ALICE' });
    expect(recherche).toHaveLength(1);
    expect(recherche[0]?.nom).toBe('Alice Martin');
  });

  it('pagine correctement (limite/offset) et renvoie le total exact', async () => {
    for (let i = 0; i < 5; i++) {
      await creerLead(
        entreeLead({ email: `lead${i}@exemple.fr`, dateReception: `2026-10-0${i + 1}` }),
      );
    }

    const page1 = await listerLeads({ limite: 2, offset: 0, tri: 'date_asc' });
    expect(page1.total).toBe(5);
    expect(page1.leads).toHaveLength(2);
    expect(page1.leads[0]?.dateReception).toBe('2026-10-01');

    const derniere = await listerLeads({ limite: 2, offset: 4, tri: 'date_asc' });
    expect(derniere.total).toBe(5);
    expect(derniere.leads).toHaveLength(1);
    expect(derniere.leads[0]?.dateReception).toBe('2026-10-05');
  });

  it('supprime logiquement un lead : il disparaît des listes', async () => {
    const { lead } = await creerLead(entreeLead());
    expect(await supprimerLead(lead.id)).toBe(true);
    expect(await lireLead(lead.id)).toBeNull();

    const { leads, total } = await listerLeads({});
    expect(leads).toHaveLength(0);
    expect(total).toBe(0);
    expect(await listerTousLeads({})).toHaveLength(0);
  });

  it("lireObjectif renvoie l'objectif par défaut pour une période inconnue, puis la valeur écrite", async () => {
    const parDefaut = await lireObjectif('2026-Q4');
    expect(parDefaut).toEqual({ periode: '2026-Q4', ...OBJECTIF_DEFAUT });

    const ecrit = await ecrireObjectif({ periode: '2026-Q4', ...OBJECTIF_DEFAUT, ciblePoints: 99 });
    expect(ecrit.ciblePoints).toBe(99);
    expect((await lireObjectif('2026-Q4')).ciblePoints).toBe(99);
  });

  it('lireReglages / ecrireReglages : aller-retour sur une valeur', async () => {
    expect((await lireReglages()).fenetreDedupeJours).toBe(30);
    await ecrireReglages({ fenetreDedupeJours: 45 });
    expect((await lireReglages()).fenetreDedupeJours).toBe(45);
  });

  it("rescorerTout applique le nouvel arbitrage B2C/newsletter (1 → 0,5 point)", async () => {
    const { lead } = await creerLead(
      entreeLead({ segment: 'b2c', initiative: 'newsletter', typeDemande: 'livre_blanc' }),
    );
    expect(lead.points).toBe(1);
    expect(lead.regleId).toBe('newsletter.lead_magnet');

    await ecrireReglages({ arbitrageB2cNewsletter: 'segment' });
    const nbRescores = await rescorerTout();
    expect(nbRescores).toBe(1);

    const relu = await lireLead(lead.id);
    expect(relu?.points).toBe(0.5);
    expect(relu?.regleId).toBe('inbound.b2c');
  });

  it('leadsAPousser liste un lead jamais synchronisé, plus après marquerSynchronise', async () => {
    const { lead } = await creerLead(entreeLead());

    const avant = await leadsAPousser();
    expect(avant.map((l) => l.id)).toContain(lead.id);

    await marquerSynchronise(lead.id, 'notion-page-test', new Date(Date.now() + 1000).toISOString());

    const apres = await leadsAPousser();
    expect(apres.map((l) => l.id)).not.toContain(lead.id);
  });
}

describe('Dépôt de données — SQLite', () => {
  let cheminTemp: string;

  beforeAll(async () => {
    cheminTemp = path.join(os.tmpdir(), `depot-test-${randomUUID()}.db`);
    delete process.env.DATABASE_URL;
    process.env.DATABASE_PATH = cheminTemp;
    await fermerDb();
  });

  afterAll(async () => {
    await fermerDb();
    for (const suffixe of ['', '-wal', '-shm']) {
      fs.rmSync(`${cheminTemp}${suffixe}`, { force: true });
    }
    delete process.env.DATABASE_PATH;
  });

  definirTests();
});

const urlPostgresTest = process.env.TEST_DATABASE_URL;

describe.skipIf(!urlPostgresTest)('Dépôt de données — PostgreSQL', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = urlPostgresTest;
    await fermerDb();
  });

  afterAll(async () => {
    await fermerDb();
    delete process.env.DATABASE_URL;
  });

  definirTests();
});
