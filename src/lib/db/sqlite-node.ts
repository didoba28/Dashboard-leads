/**
 * Pilote SQLite par défaut, via le module `node:sqlite` intégré à Node.
 *
 * C'est le chemin sans friction : aucune dépendance native à compiler, donc
 * pas de chaîne de compilation C++ à installer (le point qui bloque le plus
 * souvent sous Windows). Le module est stable depuis Node 24 et disponible
 * depuis Node 22.5 ; sur une version antérieure, `src/lib/db/index.ts`
 * retombe automatiquement sur `better-sqlite3`.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { PiloteDonnees } from './types';
import { appliquerMigrations } from './migrations';
import { MIGRATIONS_SQLITE } from './migrations-sqlite';

/** Sous-ensemble de l'API `node:sqlite` réellement utilisé ici. */
interface BaseNodeSqlite {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): { changes: number | bigint };
  };
  exec(sql: string): void;
  close(): void;
}

/**
 * `node:sqlite` refuse les valeurs qu'il ne sait pas lier (booléens,
 * `undefined`). L'application écrit déjà ses booléens en 0/1, mais cette
 * normalisation garantit qu'aucun appelant ne peut faire échouer une requête
 * sur une différence de pilote.
 */
function normaliser(params: unknown[]): unknown[] {
  return params.map((valeur) => {
    if (typeof valeur === 'boolean') return valeur ? 1 : 0;
    if (valeur === undefined) return null;
    return valeur;
  });
}

class PiloteNodeSqlite implements PiloteDonnees {
  constructor(private readonly db: BaseNodeSqlite) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...normaliser(params)) as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...normaliser(params)) as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const resultat = this.db.prepare(sql).run(...normaliser(params));
    return { changes: Number(resultat.changes) };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: (tx: PiloteDonnees) => Promise<T>): Promise<T> {
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

/** `true` si la version de Node expose le module `node:sqlite`. */
export async function nodeSqliteDisponible(): Promise<boolean> {
  try {
    const module = (await import('node:sqlite')) as { DatabaseSync?: unknown };
    return typeof module.DatabaseSync === 'function';
  } catch {
    return false;
  }
}

export async function creerPiloteNodeSqlite(chemin: string): Promise<PiloteDonnees> {
  const { DatabaseSync } = (await import('node:sqlite')) as unknown as {
    DatabaseSync: new (chemin: string) => BaseNodeSqlite;
  };
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  const db = new DatabaseSync(chemin);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  const pilote = new PiloteNodeSqlite(db);
  await appliquerMigrations(pilote, MIGRATIONS_SQLITE);
  return pilote;
}
