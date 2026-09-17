/**
 * Accès SQLite (better-sqlite3) : connexion unique par process + migrations.
 *
 * SQLite est volontaire : le volume d'un pôle Growth se compte en milliers de
 * lignes, tout tient en mémoire et le déploiement ne demande aucun service
 * externe. Le schéma reste standard, un passage à Postgres n'impacterait que
 * ce dossier.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

let instance: DB | null = null;

function cheminBase(): string {
  const brut = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'leads.db');
  return path.isAbsolute(brut) ? brut : path.join(process.cwd(), brut);
}

/** Migrations idempotentes, appliquées dans l'ordre au démarrage. */
const MIGRATIONS: Array<{ nom: string; sql: string }> = [
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

function appliquerMigrations(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (nom TEXT PRIMARY KEY, applique_le TEXT NOT NULL);`);
  const dejaApplique = new Set(
    db.prepare<[], { nom: string }>('SELECT nom FROM migrations').all().map((r) => r.nom),
  );
  const noter = db.prepare('INSERT INTO migrations (nom, applique_le) VALUES (?, ?)');
  for (const migration of MIGRATIONS) {
    if (dejaApplique.has(migration.nom)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      noter.run(migration.nom, new Date().toISOString());
    })();
  }
}

export function getDb(): DB {
  if (instance) return instance;
  const chemin = cheminBase();
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  const db = new Database(chemin);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  appliquerMigrations(db);
  instance = db;
  return db;
}

/** Réinitialise la connexion (tests). */
export function fermerDb(): void {
  instance?.close();
  instance = null;
}

export function maintenantIso(): string {
  return new Date().toISOString();
}

export function nouvelId(): string {
  return crypto.randomUUID();
}
