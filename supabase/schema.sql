-- Schéma PostgreSQL du dashboard leads — à coller tel quel dans l'éditeur SQL
-- de Supabase (ou à exécuter via `psql`).
--
-- Sécurité : les tables sont fermées à l'API publique par RLS et retrait des
-- droits anon/authenticated. Seul le serveur Next.js utilise DATABASE_URL.
--
-- Ce fichier est le pendant PostgreSQL des migrations appliquées automatiquement
-- par l'application (voir src/lib/db/postgres.ts) : mêmes tables, mêmes index.
-- L'exécuter à la main est optionnel (l'application les crée elle-même au
-- premier démarrage), mais pratique pour préparer une base à l'avance.

CREATE TABLE IF NOT EXISTS migrations (
  nom         TEXT PRIMARY KEY,
  applique_le TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id                     TEXT PRIMARY KEY,
  date_reception         TEXT NOT NULL,
  nom                    TEXT,
  email                  TEXT,
  telephone              TEXT,
  societe                TEXT,
  fonction               TEXT,
  ville                  TEXT,
  segment                TEXT NOT NULL,
  relation               TEXT NOT NULL,
  type_demande           TEXT NOT NULL,
  initiative             TEXT NOT NULL,
  source_collecte        TEXT NOT NULL,
  campagne               TEXT,
  lead_magnet            TEXT,
  message                TEXT,
  statut                 TEXT NOT NULL,
  type_activation        TEXT,
  date_activation        TEXT,
  proprietaire           TEXT,
  tags                   TEXT NOT NULL DEFAULT '[]',
  eligible               BOOLEAN NOT NULL,
  points                 DOUBLE PRECISION NOT NULL,
  eligible_activation    BOOLEAN NOT NULL,
  regle_id               TEXT NOT NULL,
  regle_label            TEXT NOT NULL,
  explication            TEXT NOT NULL DEFAULT '',
  points_override        DOUBLE PRECISION,
  points_override_raison TEXT,
  a_verifier             BOOLEAN NOT NULL DEFAULT FALSE,
  confiance              DOUBLE PRECISION,
  dedupe_key             TEXT,
  notion_page_id         TEXT,
  notion_last_synced_at  TEXT,
  raw_payload            TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  deleted_at             TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_date ON leads(date_reception);
CREATE INDEX IF NOT EXISTS idx_leads_statut ON leads(statut);
CREATE INDEX IF NOT EXISTS idx_leads_dedupe ON leads(dedupe_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_notion ON leads(notion_page_id)
  WHERE notion_page_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS objectifs (
  periode                              TEXT PRIMARY KEY,
  cible_points                         DOUBLE PRECISION NOT NULL,
  paliers_points                       TEXT NOT NULL,
  paliers_activation                   TEXT NOT NULL,
  prime_par_opportunite_supplementaire DOUBLE PRECISION NOT NULL,
  cible_activation                     DOUBLE PRECISION NOT NULL,
  updated_at                           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reglages (
  cle        TEXT PRIMARY KEY,
  valeur     TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_sync (
  id        TEXT PRIMARY KEY,
  lance_le  TEXT NOT NULL,
  direction TEXT NOT NULL,
  crees     INTEGER NOT NULL DEFAULT 0,
  maj       INTEGER NOT NULL DEFAULT 0,
  ignores   INTEGER NOT NULL DEFAULT 0,
  erreurs   TEXT NOT NULL DEFAULT '[]',
  duree_ms  INTEGER NOT NULL DEFAULT 0,
  succes    BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE objectifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reglages ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_sync ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE migrations, leads, objectifs, reglages, journal_sync FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE migrations, leads, objectifs, reglages, journal_sync FROM authenticated;
  END IF;
END $$;

-- Marque la migration comme déjà appliquée : au premier démarrage, l'application
-- constatera qu'elle existe déjà dans `migrations` et ne rejouera pas son SQL.
INSERT INTO migrations (nom, applique_le)
VALUES ('001_initial', now()::text)
ON CONFLICT (nom) DO NOTHING;
