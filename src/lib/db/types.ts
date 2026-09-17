/**
 * Interface commune aux deux pilotes de base de données (SQLite / PostgreSQL).
 *
 * `leads.ts` et `settings.ts` ne parlent qu'à cette interface : ils ignorent
 * totalement quel moteur tourne derrière. Conventions à respecter par tout
 * appelant pour que le SQL écrit une seule fois fonctionne sur les deux
 * pilotes :
 *
 * - les requêtes s'écrivent avec des marqueurs positionnels `?`, dans l'ordre
 *   des éléments du tableau `params` (jamais de paramètres nommés `@x`, ni de
 *   `$1` explicite) — le pilote PostgreSQL les traduit lui-même en `$1, $2, …` ;
 * - les colonnes booléennes (`eligible`, `a_verifier`, `succes`…) s'écrivent
 *   et se lisent comme des entiers 0/1 côté appelant (`valeur ? 1 : 0` à
 *   l'écriture, `Boolean(valeur)` à la lecture) ; côté PostgreSQL ce sont de
 *   vraies colonnes `BOOLEAN` (`1`/`0` s'y insèrent sans conversion explicite,
 *   et elles en ressortent en `true`/`false`) — `Boolean(...)` absorbe les
 *   deux représentations ;
 * - `COUNT(*)` peut revenir en `bigint` texte côté PostgreSQL : l'appelant
 *   qui exploite un tel résultat doit toujours le repasser dans `Number(...)` ;
 * - la recherche insensible à la casse s'écrit `lower(coalesce(col, '')) LIKE ?`
 *   avec un motif déjà mis en minuscules côté JS — valide sur les deux
 *   moteurs, ce qui évite d'avoir à distinguer `LIKE`/`ILIKE`.
 */
export interface PiloteDonnees {
  /** SELECT ne renvoyant au plus qu'une ligne. */
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** SELECT renvoyant plusieurs lignes. */
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** INSERT / UPDATE / DELETE ; renvoie le nombre de lignes affectées. */
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  /** DDL ou script multi-instructions (migrations), sans paramètres. */
  exec(sql: string): Promise<void>;
  /** Exécute `fn` dans une transaction ; rollback automatique si `fn` rejette. */
  transaction<T>(fn: (tx: PiloteDonnees) => Promise<T>): Promise<T>;
  /** Ferme proprement la connexion (tests, arrêt de l'application). */
  fermer(): Promise<void>;
}
