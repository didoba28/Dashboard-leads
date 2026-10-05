/**
 * Schéma SQLite, partagé par les deux pilotes SQLite (`node:sqlite` intégré à
 * Node, et `better-sqlite3` en repli). Un seul endroit décrit les tables :
 * quel que soit le pilote retenu, la base a exactement la même forme.
 */
import type { Migration } from './migrations';

export const MIGRATIONS_SQLITE: Migration[] = [
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
  {
    nom: '002_confirmation_points',
    sql: `
      ALTER TABLE leads ADD COLUMN validation_requise INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE leads ADD COLUMN points_confirmes INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE leads ADD COLUMN points_confirmes_le TEXT;
      ALTER TABLE leads ADD COLUMN points_confirmes_par TEXT;
      CREATE INDEX IF NOT EXISTS idx_leads_confirmation ON leads(points_confirmes, date_reception);
    `,
  },
];
