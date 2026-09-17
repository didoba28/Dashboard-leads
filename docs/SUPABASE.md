# Passer de SQLite à PostgreSQL / Supabase

Par défaut, le dashboard stocke ses données dans un fichier SQLite
(`data/leads.db`). C'est suffisant en local et sur un serveur avec un disque
persistant, mais pas sur un hébergement dont le système de fichiers est
éphémère (Vercel, Netlify Functions, Cloud Run…) : le fichier y disparaît à
chaque redéploiement.

Pour ces cas, l'application sait parler à PostgreSQL. La bascule se fait par
**une seule variable d'environnement**, sans toucher au code.

## En bref

```bash
# .env.local — SQLite (défaut) : ne rien mettre
# PostgreSQL / Supabase :
DATABASE_URL=postgresql://postgres:MOT_DE_PASSE@db.xxxxxxxx.supabase.co:5432/postgres
```

Au démarrage, l'application détecte l'URL, ouvre un pool PostgreSQL, applique
ses migrations si les tables n'existent pas, et se comporte exactement comme
avec SQLite. Rien d'autre ne change : mêmes écrans, mêmes routes, mêmes règles.

## Marche à suivre avec Supabase

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Dans **Project Settings → Database → Connection string**, copiez l'URI
   (onglet `URI`), et remplacez `[YOUR-PASSWORD]` par le mot de passe de la
   base choisi à la création du projet.
   - Pour un hébergement serverless, préférez la chaîne du **connection
     pooler** (port `6543`) : elle supporte un grand nombre de connexions
     courtes.
   - Pour un serveur classique qui tourne en continu, la connexion directe
     (port `5432`) convient.
3. Collez-la dans `DATABASE_URL` de votre `.env.local` (ou dans les variables
   d'environnement de votre hébergeur).
4. Optionnel — créez les tables à l'avance en collant
   [`supabase/schema.sql`](../supabase/schema.sql) dans l'éditeur SQL de
   Supabase. Ce n'est pas obligatoire : l'application crée les tables
   manquantes elle-même au premier accès. Les migrations sont idempotentes, les
   deux chemins mènent au même schéma.
5. Redémarrez l'application. Vérifiez sur la page **Intégrations** ou via
   `GET /api/reglages` que tout répond normalement.

Le chiffrement TLS est activé automatiquement quand l'URL contient
`supabase.co` ou `sslmode=require` — vous n'avez rien à configurer.

## Sécurité

La base n'est **jamais** interrogée depuis le navigateur : seules les routes
serveur Next.js s'y connectent. Tant que c'est le cas, vous pouvez laisser RLS
désactivé sur ces tables et n'exposer que `DATABASE_URL` côté serveur.

Deux règles à ne pas enfreindre :

- `DATABASE_URL` ne doit jamais être préfixée par `NEXT_PUBLIC_`, sinon elle
  serait envoyée au navigateur.
- Si un jour un accès direct depuis le client est ajouté (clé `anon`), activez
  RLS et écrivez les politiques **avant** d'exposer quoi que ce soit.

## Migrer des données existantes

Il n'y a pas d'outil de migration automatique. Le chemin le plus simple passe
par le CSV, qui préserve toutes les dimensions métier :

1. Sur l'instance SQLite, exportez chaque trimestre :
   `GET /api/export?periode=2026-Q4` (ou le bouton « Exporter CSV » de la page
   Leads).
2. Basculez `DATABASE_URL` vers PostgreSQL et redémarrez.
3. Réimportez chaque fichier depuis la page Leads (bouton « Importer »).

Les points sont recalculés à l'import par le moteur de règles : les valeurs
importées ne sont jamais reprises telles quelles, sauf les points forcés
manuellement, qui sont conservés.

Les objectifs et les paliers de primes ne passent pas par le CSV : re-saisissez
-les sur la page **Objectifs & primes** (quelques secondes par trimestre), ou
copiez les lignes de la table `objectifs` à la main.

Si vous préférez transférer la base telle quelle, les deux schémas ont les
mêmes tables et les mêmes colonnes : un `pg_dump`/`COPY` depuis un export
SQLite fonctionne aussi, mais demande de convertir les colonnes booléennes
(`INTEGER` 0/1 côté SQLite, `BOOLEAN` côté PostgreSQL).

## Comment c'est implémenté

Tout est contenu dans `src/lib/db/` ; aucun autre dossier ne sait quel moteur
est utilisé.

| Fichier | Rôle |
| --- | --- |
| `types.ts` | L'interface `PiloteDonnees` que les deux moteurs respectent, et la convention SQL commune. |
| `index.ts` | Choisit le pilote selon `DATABASE_URL` et mémorise la connexion pour le process. |
| `sqlite-node.ts` | Pilote SQLite par défaut, via le module `node:sqlite` intégré à Node (rien à compiler). |
| `sqlite.ts` | Pilote SQLite de repli, via `better-sqlite3`, pour Node antérieur à 22.5. |
| `postgres.ts` | Pilote `pg` : traduit les placeholders `?` en `$1, $2, …`, gère les transactions sur un client dédié, active TLS si besoin. |
| `migrations.ts` | Exécuteur de migrations idempotent, partagé par les deux pilotes. |

Les différences entre moteurs sont absorbées dans le pilote : `leads.ts` et
`settings.ts` écrivent un SQL unique. Les trois points qui demandaient une
attention particulière sont documentés en tête de `postgres.ts` : placeholders,
`COUNT(*)` qui revient en texte côté PostgreSQL, et colonnes booléennes.

## Tests

Les dix tests d'intégration de `src/lib/db/depot.test.ts` s'exécutent sur
SQLite à chaque `npm test`. `SQLITE_DRIVER=node` et `SQLITE_DRIVER=better`
permettent de les rejouer sur chacun des deux pilotes SQLite. Pour les rejouer à l'identique sur PostgreSQL :

```bash
createdb dashboard_leads_test
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/dashboard_leads_test npm test
```

Sans `TEST_DATABASE_URL`, la partie PostgreSQL est ignorée plutôt que mise en
échec. Cette suite a été validée contre PostgreSQL 16.
