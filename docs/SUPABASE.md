# Passer de SQLite à PostgreSQL / Supabase

Par défaut, le dashboard stocke ses données dans un fichier SQLite
(`data/leads.db`). C'est suffisant en local et sur un serveur avec un disque
persistant, mais pas sur un hébergement dont le système de fichiers est
éphémère (Vercel, Netlify Functions, Cloud Run…) : le fichier y disparaît à
chaque redéploiement.

Pour ces cas, l'application sait parler à PostgreSQL via `DATABASE_URL`.
Si le serveur utilise un rôle limité et que le schéma est préparé à l'avance,
ajoutez aussi `DATABASE_SCHEMA_MANAGED=1`.

## En bref

```bash
# .env.local — SQLite (défaut) : ne rien mettre
# PostgreSQL / Supabase :
DATABASE_URL=postgresql://postgres:MOT_DE_PASSE@db.xxxxxxxx.supabase.co:5432/postgres
```

Au démarrage, l'application détecte l'URL, ouvre un pool PostgreSQL, applique
ses migrations si `DATABASE_SCHEMA_MANAGED` n'est pas `1`, et se comporte exactement comme
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
4. Pour utiliser un rôle PostgreSQL limité, créez les tables à l'avance en collant
   [`supabase/schema.sql`](../supabase/schema.sql) dans l'éditeur SQL de
   Supabase. Ce fichier crée aussi `dashboard_app`, sans mot de passe. Définissez
   un mot de passe fort pour ce rôle dans Supabase et utilisez-le dans
   `DATABASE_URL` ; réglez `DATABASE_SCHEMA_MANAGED=1`. Sans rôle limité,
   l'application peut créer les tables au premier accès avec un compte ayant
   les droits DDL.
5. Redémarrez l'application. Vérifiez `/api/health` puis la page **Intégrations** ou via
   `GET /api/reglages` que tout répond normalement.

Le chiffrement TLS est activé automatiquement pour Supabase et le certificat
du serveur est vérifié. Si votre projet utilise une autorité de certification
propre à Supabase, copiez son certificat PEM depuis les réglages SSL de la base
dans `SUPABASE_DB_CA_CERT` (sauts de ligne représentés par `\n`). Ne
désactivez pas la vérification TLS pour résoudre une erreur de certificat.

## Authentification des personnes

Le projet Supabase sert également à l'authentification du dashboard :

1. Gardez le fournisseur e-mail activé et désactivez les inscriptions publiques
   au niveau global de Supabase Auth (`auth.enable_signup = false`). Ne
   désactivez pas `auth.email.enable_signup` : cela bloque aussi la connexion
   par lien e-mail des comptes existants. Créez chaque compte autorisé dans
   **Authentication → Users**.
2. Renseignez l'URL du dashboard dans la configuration des URL Auth de Supabase,
   avec `https://VOTRE-DOMAINE/auth/callback` comme URL de redirection admise.
3. Définissez `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   et `DASHBOARD_ALLOWED_EMAILS` (adresses exactes séparées par des virgules).
4. Chaque personne reçoit un lien e-mail et doit configurer puis saisir un
   code TOTP. L'accès aux pages et aux API attend une session de niveau `aal2`.

Pour un usage réel, configurez un [serveur SMTP dédié](https://supabase.com/docs/guides/auth/auth-smtp)
dans Supabase Auth. Le service e-mail gratuit de Supabase limite l'envoi aux
membres de l'organisation, avec un quota réduit. Ne donnez pas un accès à
l'organisation Supabase uniquement pour permettre la réception d'un lien.

La clé publiable est visible dans le navigateur par conception. La migration
`002_verrouillage_rls` active RLS et retire les droits `anon` et
`authenticated` sur toutes les tables du dashboard. Aucune politique publique
n'est créée ; le serveur y accède avec `DATABASE_URL`.

## Sécurité

La base métier n'est **jamais** interrogée depuis le navigateur : seules les
routes serveur Next.js s'y connectent. RLS reste activé pour fermer l'API Data
de Supabase aux clés publiques, même si celles-ci sont présentes dans le client
pour Supabase Auth.

Deux règles à ne pas enfreindre :

- `DATABASE_URL` ne doit jamais être préfixée par `NEXT_PUBLIC_`, sinon elle
  serait envoyée au navigateur.
- Si un jour un accès direct à ces tables depuis le client est ajouté, créez
  des droits et des politiques RLS strictes avant de l'activer.

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
