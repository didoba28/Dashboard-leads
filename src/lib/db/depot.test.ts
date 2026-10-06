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
  confirmerPointsLeads,
  leadsAPousser,
  lireLead,
  listerLeads,
  listerTousLeads,
  listerValidationsAutomatiques,
  marquerSynchronise,
  mettreAJourLead,
  retraiterAutomatisationHistorique,
  rescorerTout,
  supprimerLead,
  supprimerLeads,
} from './leads';
import { AUTEUR_VALIDATION_AUTOMATIQUE } from '@/lib/domain/automation';
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
    expect((await listerLeads({ pointsConfirmes: true })).leads.map((item) => item.id)).toContain(lead.id);

    const modifie = await mettreAJourLead(lead.id, { relation: 'client' });
    expect(modifie?.pointsConfirmes).toBe(false);
    expect(modifie?.pointsConfirmesLe).toBeNull();
    expect(pointsDuLead(modifie!)).toBe(0);
  });

  it('confirme automatiquement à 90 % et journalise la décision', async () => {
    const { lead } = await creerLead(
      entreeLead({ sourceCollecte: 'site_web', confiance: 0.9, aVerifier: false }),
      { validationRequise: true },
    );
    expect(lead.pointsConfirmes).toBe(true);
    expect(lead.pointsConfirmesPar).toBe(AUTEUR_VALIDATION_AUTOMATIQUE);
    expect(lead.pointsConfirmesLe).not.toBeNull();
    expect(pointsDuLead(lead)).toBe(1);

    const rapport = await listerValidationsAutomatiques();
    expect(rapport.total).toBe(1);
    expect(rapport.leads[0]?.id).toBe(lead.id);
  });

  it('ne confirme pas automatiquement un e-mail interne AirFit', async () => {
    const { lead } = await creerLead(
      entreeLead({ email: 'adel@airfit.co', sourceCollecte: 'site_web', confiance: 1, aVerifier: false }),
      { validationRequise: true },
    );
    expect(lead.pointsConfirmes).toBe(false);
  });

  it('retraite idempotemment un ancien lead devenu fiable', async () => {
    const { lead } = await creerLead(
      entreeLead({ sourceCollecte: 'slack_inbound', confiance: 0.5, aVerifier: false }),
      { validationRequise: true },
    );
    await mettreAJourLead(lead.id, { confiance: 0.95 });
    expect((await retraiterAutomatisationHistorique()).valides).toBe(1);
    expect((await retraiterAutomatisationHistorique()).valides).toBe(0);
    expect((await lireLead(lead.id))?.pointsConfirmesPar).toBe(AUTEUR_VALIDATION_AUTOMATIQUE);
  });

  it('confirme et supprime une sélection de leads en lot', async () => {
    const premier = await creerLead(entreeLead({ email: 'premier@exemple.fr' }), { validationRequise: true });
    const second = await creerLead(entreeLead({ email: 'second@exemple.fr' }), { validationRequise: true });
    const troisieme = await creerLead(entreeLead({ email: 'troisieme@exemple.fr' }), { validationRequise: true });

    expect(await confirmerPointsLeads([premier.lead.id, second.lead.id], 'adel@airfit.co')).toBe(2);
    expect((await lireLead(premier.lead.id))?.pointsConfirmes).toBe(true);
    expect((await lireLead(second.lead.id))?.pointsConfirmesPar).toBe('adel@airfit.co');
    expect((await lireLead(troisieme.lead.id))?.pointsConfirmes).toBe(false);

    expect(await supprimerLeads([premier.lead.id, troisieme.lead.id])).toBe(2);
    expect(await lireLead(premier.lead.id)).toBeNull();
    expect(await lireLead(second.lead.id)).not.toBeNull();
    expect(await lireLead(troisieme.lead.id)).toBeNull();
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

  it('filtre les leads sur une plage de dates personnalisée inclusive', async () => {
    await creerLead(entreeLead({ nom: 'Avant', email: 'avant@exemple.fr', dateReception: '2026-09-01' }));
    await creerLead(entreeLead({ nom: 'Début', email: 'debut@exemple.fr', dateReception: '2026-09-10' }));
    await creerLead(entreeLead({ nom: 'Fin', email: 'fin@exemple.fr', dateReception: '2026-09-20' }));
    await creerLead(entreeLead({ nom: 'Après', email: 'apres@exemple.fr', dateReception: '2026-09-21' }));

    const { leads } = await listerLeads({ dateDebut: '2026-09-10', dateFin: '2026-09-20' });
    expect(leads.map((lead) => lead.nom).sort()).toEqual(['Début', 'Fin']);
  });

  it('fusionne le même e-mail venu de deux origines sans écraser les données existantes', async () => {
    const premier = await creerLead(entreeLead({
      email: 'multi@exemple.fr',
      typeDemande: 'formulaire_contact',
      societe: 'Société initiale',
      telephone: null,
      message: 'Premier formulaire',
    }));
    const second = await creerLead(entreeLead({
      email: 'multi@exemple.fr',
      typeDemande: 'simulateur',
      leadMagnet: 'Simulateur collectivités',
      societe: 'Valeur contradictoire',
      telephone: '06 12 34 56 78',
      message: 'Seconde occurrence',
    }));

    expect(second.doublon).toBe(true);
    expect(second.lead.id).toBe(premier.lead.id);
    expect(second.lead).toMatchObject({
      typeDemande: 'simulateur',
      leadMagnet: 'Simulateur collectivités',
      telephone: '06 12 34 56 78',
      societe: 'Société initiale',
    });
    expect(second.lead.message).toContain('Premier formulaire');
    expect(second.lead.message).toContain('Seconde occurrence');
    expect((await listerLeads({})).total).toBe(1);
  });

  it('fusionne le même e-mail reçu le lendemain avec la fenêtre de 1 jour', async () => {
    await creerLead(entreeLead({ email: 'jour@exemple.fr', dateReception: '2026-10-15' }));
    const lendemain = await creerLead(entreeLead({ email: 'jour@exemple.fr', dateReception: '2026-10-16' }));
    expect(lendemain.doublon).toBe(true);
    expect((await listerLeads({})).total).toBe(1);
  });

  it('fusionne Slack et une saisie enrichie grâce au même nom et à la même ville', async () => {
    const slack = await creerLead(entreeLead({
      nom: 'Karen Douglas',
      ville: 'Lamentin',
      email: null,
      telephone: null,
      sourceCollecte: 'slack_inbound',
      typeDemande: 'simulateur',
    }));
    const manuel = await creerLead(entreeLead({
      nom: 'Karen Douglas',
      ville: 'Lamentin',
      email: 'douglaskaren09@gmail.com',
      telephone: '+590690194156',
      sourceCollecte: 'manuel',
    }));

    expect(manuel.doublon).toBe(true);
    expect(manuel.lead.id).toBe(slack.lead.id);
    expect(manuel.lead.email).toBe('douglaskaren09@gmail.com');
    expect((await listerLeads({})).total).toBe(1);
  });

  it('répare le nom et la ville des anciennes notifications Slack compactes', async () => {
    const { lead } = await creerLead(
      entreeLead({
        nom: null,
        ville: null,
        sourceCollecte: 'slack_inbound',
        message: 'Nouveau lead AirFit : de Cuniac Titouan (Nancy 54000)',
      }),
    );

    const { leads } = await listerLeads({});
    expect(leads[0]).toMatchObject({ nom: 'de Cuniac Titouan', ville: 'Nancy' });
    expect(await lireLead(lead.id)).toMatchObject({ nom: 'de Cuniac Titouan', ville: 'Nancy' });
  });

  it('reclasse les anciens leads Slack en collectivités sans annuler leur confirmation', async () => {
    const { lead } = await creerLead(
      entreeLead({
        sourceCollecte: 'slack_inbound',
        segment: 'b2b',
        message: 'Nouveau lead AirFit : Camille Martin (Lyon)',
      }),
      { validationRequise: true },
    );
    await confirmerPointsLead(lead.id, 'adel@airfit.co');

    const resultat = await listerLeads({ segment: ['collectivite'] });
    expect(resultat.total).toBe(1);
    expect(resultat.leads[0]).toMatchObject({
      id: lead.id,
      segment: 'collectivite',
      pointsConfirmes: true,
      pointsConfirmesPar: 'adel@airfit.co',
    });
  });

  it('répare le format compact Nouveau contact et son classement inbound non confirmé', async () => {
    const { lead } = await creerLead(
      entreeLead({
        nom: null,
        ville: null,
        sourceCollecte: 'slack_inbound',
        relation: 'client',
        initiative: 'inbound_site',
        confiance: 0.5,
        aVerifier: true,
        message: 'Nouveau contact AirFit : CHRISTOPHE MALINS (SAINT-SAVIN)',
      }),
      { validationRequise: true },
    );

    const { leads } = await listerLeads({});
    expect(leads[0]).toMatchObject({
      nom: 'CHRISTOPHE MALINS',
      ville: 'SAINT-SAVIN',
      relation: 'prospect',
      initiative: 'inbound_site',
      points: 1,
    });
    expect(await lireLead(lead.id)).toMatchObject({ relation: 'prospect', points: 1 });
  });

  it('récupère l’origine des anciens leads dans les blocs Slack', async () => {
    const { lead } = await creerLead(
      entreeLead({
        sourceCollecte: 'slack_inbound',
        typeDemande: 'formulaire_contact',
        message: 'Nouveau lead AirFit : Camille Martin (Lyon 69000)',
        rawPayload: {
          source: 'slack',
          evenement: {
            text: 'Nouveau lead AirFit : Camille Martin (Lyon 69000)',
            blocks: [{ type: 'section', fields: [{ type: 'mrkdwn', text: '*Origine*\nSimulateur' }] }],
          },
        },
      }),
    );

    const { leads } = await listerLeads({});
    expect(leads[0]).toMatchObject({ typeDemande: 'simulateur', leadMagnet: 'simulateur' });
    expect(await lireLead(lead.id)).toMatchObject({ typeDemande: 'simulateur', leadMagnet: 'simulateur' });
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
    expect((await lireReglages()).fenetreDedupeJours).toBe(1);
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
