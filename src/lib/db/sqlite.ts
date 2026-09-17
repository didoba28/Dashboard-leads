/**
 * Pilote SQLite de repli, via le paquet natif `better-sqlite3`.
 *
 * Il n'est utilisé que sur les versions de Node antérieures à 22.5, qui n'ont
 * pas encore le module intégré `node:sqlite` (voir `sqlite-node.ts`). Comme
 * `better-sqlite3` doit être compilé quand aucun binaire précompilé ne
 * correspond à la version de Node, il est déclaré en dépendance *optionnelle*
 * et importé dynamiquement : son absence ne casse ni l'installation, ni le
 * démarrage.
 *
 * better-sqlite3 est entièrement synchrone (aucune E/S asynchrone réelle) ;
 * chaque méthode est simplement enveloppée dans une Promise résolue tout de
 * suite, pour respecter l'interface commune `PiloteDonnees`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { PiloteDonnees } from './types';
import { appliquerMigrations } from './migrations';
import { MIGRATIONS_SQLITE } from './migrations-sqlite';

/** Sous-ensemble de l'API better-sqlite3 réellement utilisé ici. */
interface BaseBetterSqlite {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): { changes: number };
  };
  exec(sql: string): void;
  pragma(instruction: string): unknown;
  close(): void;
}

class PiloteBetterSqlite implements PiloteDonnees {
  constructor(private readonly db: BaseBetterSqlite) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    return { changes: this.db.prepare(sql).run(...params).changes };
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

/**
 * Chargement à l'exécution, volontairement opaque pour le bundler : un
 * `import('better-sqlite3')` littéral serait résolu à la compilation, et le
 * build échouerait sur les machines où la dépendance optionnelle n'a pas pu
 * être installée — exactement le cas que ce pilote de repli doit couvrir.
 */
function chargerBetterSqlite(): new (chemin: string) => BaseBetterSqlite {
  const requerir = createRequire(path.join(process.cwd(), 'index.js'));
  const module = requerir('better-sqlite3') as
    | (new (chemin: string) => BaseBetterSqlite)
    | { default: new (chemin: string) => BaseBetterSqlite };
  return 'default' in module ? module.default : module;
}

/** `true` si `better-sqlite3` est installé et chargeable sur cette machine. */
export async function betterSqliteDisponible(): Promise<boolean> {
  try {
    chargerBetterSqlite();
    return true;
  } catch {
    return false;
  }
}

export async function creerPiloteBetterSqlite(chemin: string): Promise<PiloteDonnees> {
  const Database = chargerBetterSqlite();
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  const db = new Database(chemin);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const pilote = new PiloteBetterSqlite(db);
  await appliquerMigrations(pilote, MIGRATIONS_SQLITE);
  return pilote;
}
