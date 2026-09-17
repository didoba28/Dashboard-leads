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
import { creerPiloteSqlite } from './sqlite';
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

/** Quel pilote sera (ou est) utilisé, déterminé uniquement par `DATABASE_URL`. */
export function nomDuPilote(): 'sqlite' | 'postgres' {
  return urlPostgres() ? 'postgres' : 'sqlite';
}

let instancePromise: Promise<PiloteDonnees> | null = null;

async function initialiser(): Promise<PiloteDonnees> {
  const url = urlPostgres();
  return url ? creerPilotePostgres(url) : creerPiloteSqlite(cheminBaseSqlite());
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
