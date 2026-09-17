/**
 * Pilote SQLite (better-sqlite3) — moteur par défaut.
 *
 * SQLite reste volontaire pour un pôle Growth : le volume se compte en
 * milliers de lignes, tout tient en mémoire et le déploiement ne demande
 * aucun service externe.
 *
 * better-sqlite3 est entièrement synchrone (aucune E/S asynchrone réelle) ;
 * chaque méthode est simplement enveloppée dans une Promise résolue tout de
 * suite, pour respecter l'interface commune `PiloteDonnees` que partage le
 * pilote PostgreSQL.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { PiloteDonnees } from './types';
import { appliquerMigrations, type Migration } from './migrations';

const MIGRATIONS_SQLITE: Migration[] = [
  {
    nom: '001_initial',
    sql: `
      CREATE TABLE IF NOT EXISTS leads (
        id                    TEXT PRIMARY KEY,
        date_reception        TEXT NOT NULL,
        nom                   TEXT,
        email                 TEXT,
        telephone             TEXT,
        societe               TEXT,
        fonction              TEXT,
        ville                 TEXT,
        segment               TEXT NOT NULL,
        relation              TEXT NOT NULL,
        type_demande          TEXT NOT NULL,
        initiative            TEXT NOT NULL,
        source_collecte       TEXT NOT NULL,
        campagne              TEXT,
        lead_magnet           TEXT,
        message               TEXT,
        statut                TEXT NOT NULL,
        type_activation       TEXT,
        date_activation       TEXT,
        proprietaire          TEXT,
        tags                  TEXT NOT NULL DEFAULT '[]',
        eligible              INTEGER NOT NULL,
        points                REAL NOT NULL,
        eligible_activation   INTEGER NOT NULL,
        regle_id              TEXT NOT NULL,
        regle_label           TEXT NOT NULL,
        explication           TEXT NOT NULL DEFAULT '',
        points_override       REAL,
        points_override_raison TEXT,
        a_verifier            INTEGER NOT NULL DEFAULT 0,
        confiance             REAL,
        dedupe_key            TEXT,
        notion_page_id        TEXT,
        notion_last_synced_at TEXT,
        raw_payload           TEXT,
        created_at            TEXT NOT NULL,
        updated_at            TEXT NOT NULL,
        deleted_at            TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_leads_date ON leads(date_reception);
      CREATE INDEX IF NOT EXISTS idx_leads_statut ON leads(statut);
      CREATE INDEX IF NOT EXISTS idx_leads_dedupe ON leads(dedupe_key);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_notion ON leads(notion_page_id)
        WHERE notion_page_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS objectifs (
        periode                              TEXT PRIMARY KEY,
        cible_points                         REAL NOT NULL,
        paliers_points                       TEXT NOT NULL,
        paliers_activation                   TEXT NOT NULL,
        prime_par_opportunite_supplementaire REAL NOT NULL,
        cible_activation                     REAL NOT NULL,
        updated_at                           TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reglages (
        cle        TEXT PRIMARY KEY,
        valeur     TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS journal_sync (
        id          TEXT PRIMARY KEY,
        lance_le    TEXT NOT NULL,
        direction   TEXT NOT NULL,
        crees       INTEGER NOT NULL DEFAULT 0,
        maj         INTEGER NOT NULL DEFAULT 0,
        ignores     INTEGER NOT NULL DEFAULT 0,
        erreurs     TEXT NOT NULL DEFAULT '[]',
        duree_ms    INTEGER NOT NULL DEFAULT 0,
        succes      INTEGER NOT NULL DEFAULT 1
      );
    `,
  },
];

class PiloteSqlite implements PiloteDonnees {
  constructor(private readonly db: Database.Database) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare<unknown[], T>(sql).get(...params);
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare<unknown[], T>(sql).all(...params);
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const resultat = this.db.prepare(sql).run(...params);
    return { changes: resultat.changes };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: (tx: PiloteDonnees) => Promise<T>): Promise<T> {
    // Connexion unique : la transaction s'appuie sur cette même instance,
    // il n'existe pas de « client » distinct comme côté PostgreSQL.
    this.db.exec('BEGIN');
    try {
      const resultat = await fn(this);
      this.db.exec('COMMIT');
      return resultat;
    } catch (erreur) {
      this.db.exec('ROLLBACK');
      throw erreur;
    }
  }

  async fermer(): Promise<void> {
    this.db.close();
  }
}

export async function creerPiloteSqlite(chemin: string): Promise<PiloteDonnees> {
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  const db = new Database(chemin);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const pilote = new PiloteSqlite(db);
  await appliquerMigrations(pilote, MIGRATIONS_SQLITE);
  return pilote;
}
