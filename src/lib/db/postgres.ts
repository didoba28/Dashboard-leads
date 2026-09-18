/**
 * Pilote PostgreSQL (`pg`) — activé quand `DATABASE_URL` pointe vers
 * `postgres://` ou `postgresql://` (typiquement une base Supabase).
 *
 * Différences avec SQLite, toutes absorbées ici (jamais visibles de
 * `leads.ts` / `settings.ts`) :
 * - placeholders `$1, $2, …` au lieu de `?` (voir `traduireSql`) ;
 * - `RETURNING`/`ON CONFLICT … DO UPDATE SET x = excluded.x` : syntaxe déjà
 *   identique à SQLite, aucune traduction nécessaire ;
 * - `COUNT(*)` revient en texte (`bigint`) : converti par l'appelant via
 *   `Number(...)` (voir le commentaire dans `types.ts`) ;
 * - les colonnes booléennes sont de vraies colonnes `BOOLEAN` (le schéma SQL
 *   ci-dessous), alors que SQLite les stocke en `INTEGER` 0/1 ; comme `pg`
 *   accepte tel quel un entier 0/1 en entrée d'une colonne `BOOLEAN`, aucune
 *   conversion n'est nécessaire à l'écriture — seule la lecture doit passer
 *   par `Boolean(...)` côté mapping (la valeur peut revenir en `true`/`false`
 *   ou en `1`/`0` selon le pilote).
 */
import { Pool, type PoolClient } from 'pg';
import type { PiloteDonnees } from './types';
import { appliquerMigrations, type Migration } from './migrations';

const MIGRATIONS_POSTGRES: Migration[] = [
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
        eligible              BOOLEAN NOT NULL,
        points                DOUBLE PRECISION NOT NULL,
        eligible_activation   BOOLEAN NOT NULL,
        regle_id              TEXT NOT NULL,
        regle_label           TEXT NOT NULL,
        explication           TEXT NOT NULL DEFAULT '',
        points_override       DOUBLE PRECISION,
        points_override_raison TEXT,
        a_verifier            BOOLEAN NOT NULL DEFAULT FALSE,
        confiance             DOUBLE PRECISION,
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
        id          TEXT PRIMARY KEY,
        lance_le    TEXT NOT NULL,
        direction   TEXT NOT NULL,
        crees       INTEGER NOT NULL DEFAULT 0,
        maj         INTEGER NOT NULL DEFAULT 0,
        ignores     INTEGER NOT NULL DEFAULT 0,
        erreurs     TEXT NOT NULL DEFAULT '[]',
        duree_ms    INTEGER NOT NULL DEFAULT 0,
        succes      BOOLEAN NOT NULL DEFAULT TRUE
      );

      -- Ferme les tables dès leur première transaction de création.
      ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
      ALTER TABLE objectifs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE reglages ENABLE ROW LEVEL SECURITY;
      ALTER TABLE journal_sync ENABLE ROW LEVEL SECURITY;
    `,
  },
  {
    nom: '002_verrouillage_rls',
    sql: `
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
    `,
  },
];

/** Traduit les marqueurs positionnels `?` (convention commune, voir types.ts) en `$1, $2, …`. */
function traduireSql(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

class PilotePostgres implements PiloteDonnees {
  constructor(
    private readonly executeur: Pool | PoolClient,
    /** Présent uniquement sur l'instance racine : permet d'ouvrir une transaction. */
    private readonly pool: Pool | null = null,
  ) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const resultat = await this.executeur.query(traduireSql(sql), params);
    return resultat.rows[0] as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const resultat = await this.executeur.query(traduireSql(sql), params);
    return resultat.rows as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const resultat = await this.executeur.query(traduireSql(sql), params);
    return { changes: resultat.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    // Pas de paramètres : passe par le protocole « simple query » de `pg`,
    // qui accepte plusieurs instructions séparées par `;` en un seul appel —
    // exactement ce dont les migrations ont besoin, comme `Database.exec` côté SQLite.
    await this.executeur.query(sql);
  }

  async transaction<T>(fn: (tx: PiloteDonnees) => Promise<T>): Promise<T> {
    if (!this.pool) {
      // Déjà à l'intérieur d'une transaction (instance liée à un client dédié).
      return fn(this);
    }
    const client = await this.pool.connect();
    const tx = new PilotePostgres(client);
    try {
      await client.query('BEGIN');
      const resultat = await fn(tx);
      await client.query('COMMIT');
      return resultat;
    } catch (erreur) {
      await client.query('ROLLBACK');
      throw erreur;
    } finally {
      client.release();
    }
  }

  async fermer(): Promise<void> {
    await this.pool?.end();
  }
}

export async function creerPilotePostgres(urlConnexion: string): Promise<PiloteDonnees> {
  const url = new URL(urlConnexion);
  const sslMode = url.searchParams.get('sslmode');
  // node-postgres peut écraser l'objet `ssl` si sslmode reste dans l'URI.
  url.searchParams.delete('sslmode');
  const supabase = url.hostname === 'supabase.co' || url.hostname.endsWith('.supabase.co');
  const tls = supabase || sslMode === 'require' || sslMode === 'verify-full' || sslMode === 'verify-ca';
  const ca = process.env.SUPABASE_DB_CA_CERT?.replace(/\\n/g, '\n');
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: tls ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : undefined,
    max: 5,
  });
  const pilote = new PilotePostgres(pool, pool);
  if (process.env.DATABASE_SCHEMA_MANAGED !== '1') {
    await appliquerMigrations(pilote, MIGRATIONS_POSTGRES);
  }
  return pilote;
}
