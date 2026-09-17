/**
 * Point d'entrée du dépôt de données : choisit le pilote (SQLite par défaut,
 * PostgreSQL si `DATABASE_URL` est défini) et l'expose sous la même
 * interface `PiloteDonnees` au reste de l'application.
 *
 * `leads.ts` et `settings.ts` n'importent que ce module — jamais `sqlite.ts`
 * ni `postgres.ts` directement.
 */
import path from 'node:path';
import type { PiloteDonnees } from './types';
import { creerPiloteNodeSqlite, nodeSqliteDisponible } from './sqlite-node';
import { betterSqliteDisponible, creerPiloteBetterSqlite } from './sqlite';
import { creerPilotePostgres } from './postgres';

export type { PiloteDonnees } from './types';

function cheminBaseSqlite(): string {
  const brut = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'leads.db');
  return path.isAbsolute(brut) ? brut : path.join(process.cwd(), brut);
}

/** `DATABASE_URL`, seulement si elle désigne bien une connexion PostgreSQL. */
function urlPostgres(): string | null {
  const brut = process.env.DATABASE_URL;
  if (!brut) return null;
  return /^postgres(ql)?:\/\//.test(brut) ? brut : null;
}

export type NomPilote = 'postgres' | 'node-sqlite' | 'better-sqlite3';

/**
 * Permet de forcer un pilote SQLite précis (`node` ou `better`), essentiellement
 * pour rejouer la même suite de tests sur les deux implémentations.
 */
function preferenceSqlite(): 'node' | 'better' | null {
  const brut = process.env.SQLITE_DRIVER?.trim().toLowerCase();
  if (brut === 'node' || brut === 'better') return brut;
  return null;
}

/**
 * Choisit le pilote SQLite : le module intégré à Node d'abord (rien à
 * compiler), `better-sqlite3` ensuite si Node est trop ancien.
 */
async function choisirPiloteSqlite(): Promise<'node-sqlite' | 'better-sqlite3'> {
  const preference = preferenceSqlite();
  if (preference === 'better') return 'better-sqlite3';
  if (preference === 'node') return 'node-sqlite';
  return (await nodeSqliteDisponible()) ? 'node-sqlite' : 'better-sqlite3';
}

/** Quel pilote est réellement utilisé, une fois la connexion ouverte. */
export async function nomDuPilote(): Promise<NomPilote> {
  if (urlPostgres()) return 'postgres';
  return choisirPiloteSqlite();
}

let instancePromise: Promise<PiloteDonnees> | null = null;

async function initialiser(): Promise<PiloteDonnees> {
  const url = urlPostgres();
  if (url) return creerPilotePostgres(url);

  const chemin = cheminBaseSqlite();
  const choix = await choisirPiloteSqlite();
  if (choix === 'node-sqlite') return creerPiloteNodeSqlite(chemin);

  if (!(await betterSqliteDisponible())) {
    throw new Error(
      "Aucun moteur SQLite disponible : ce Node n'expose pas `node:sqlite` (ajouté en 22.5) " +
        "et `better-sqlite3` n'est pas installé. Mettez Node à jour (22.5+ ou, mieux, 24), " +
        'ou installez `better-sqlite3`, ou définissez `DATABASE_URL` pour utiliser PostgreSQL.',
    );
  }
  return creerPiloteBetterSqlite(chemin);
}

/** Connexion unique par process (mémoïse aussi l'application des migrations). */
export async function getDb(): Promise<PiloteDonnees> {
  if (!instancePromise) instancePromise = initialiser();
  return instancePromise;
}

/** Réinitialise la connexion (tests : change de base entre deux suites). */
export async function fermerDb(): Promise<void> {
  if (!instancePromise) return;
  const enCours = instancePromise;
  instancePromise = null;
  const db = await enCours;
  await db.fermer();
}

export function maintenantIso(): string {
  return new Date().toISOString();
}

export function nouvelId(): string {
  return crypto.randomUUID();
}
