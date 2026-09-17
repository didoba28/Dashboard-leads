/**
 * Exécution des migrations, commune aux deux pilotes.
 *
 * Seul le SQL d'une migration diffère d'un moteur à l'autre (voir
 * `sqlite.ts` et `postgres.ts`) ; la mécanique — table `migrations`, ordre
 * d'application, idempotence, transaction par migration — est identique et
 * ne dépend que de l'interface `PiloteDonnees`.
 */
import type { PiloteDonnees } from './types';

export interface Migration {
  nom: string;
  sql: string;
}

export async function appliquerMigrations(
  db: PiloteDonnees,
  migrations: readonly Migration[],
): Promise<void> {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS migrations (nom TEXT PRIMARY KEY, applique_le TEXT NOT NULL)',
  );
  const dejaAppliquees = new Set(
    (await db.all<{ nom: string }>('SELECT nom FROM migrations')).map((r) => r.nom),
  );
  for (const migration of migrations) {
    if (dejaAppliquees.has(migration.nom)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.run('INSERT INTO migrations (nom, applique_le) VALUES (?, ?)', [
        migration.nom,
        new Date().toISOString(),
      ]);
    });
  }
}
