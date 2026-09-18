# Dashboard Leads

Dashboard de suivi des leads entrants pour le pôle Growth. Il centralise les leads
qui arrivent par le canal Slack `#inbound` et par les e-mails de notification de
formulaire, leur applique les règles de comptage définies par l'équipe (points,
exclusions, arbitrages), suit l'avancement des objectifs et des primes du
trimestre, et reste synchronisé avec un espace de travail Notion partagé.

## Prérequis

Node 22.5 ou plus récent (Node 24 recommandé) — vérifiez avec `node -v`. Cette
version est requise parce que le stockage s'appuie sur le module `node:sqlite`
intégré à Node : aucune dépendance à compiler, donc aucune chaîne de
compilation C++ à installer.

## Démarrage rapide

```bash
npm install
cp .env.example .env.local
npm run db:seed
npm run dev
```

Ouvrez ensuite [http://localhost:3000](http://localhost:3000).

L'application démarre sans aucune configuration préalable : la base SQLite
(`data/leads.db`) est créée automatiquement au premier accès, et Notion comme
Slack sont optionnels — leurs écrans indiquent clairement quand ils ne sont pas
configurés. `npm run db:seed` remplit la base avec un jeu de démonstration
déterministe (environ 140 leads répartis sur 2026-Q3 et 2026-Q4) pratique pour
explorer le dashboard sans attendre de vraies données ; il refuse de s'exécuter
si la base contient déjà des leads, sauf avec l'option `--reset`.

## Les écrans

### Vue d'ensemble (`/`)

Point d'entrée du dashboard pour une période donnée : jauges des deux
dispositifs de primes (points et opportunités activées/réactivées), prime
totale projetée, indicateurs clés (leads reçus, points validés, leads exclus,
taux d'activation, leads « à vérifier »…), trajectoire hebdomadaire vs cible,
répartitions par segment / initiative / type de demande / canal de collecte,
entonnoir de qualification et classements des meilleures campagnes et lead
magnets.

### Leads (`/leads`)

Liste filtrable et triable de tous les leads (recherche plein texte, segment,
statut, type de demande, initiative, « à vérifier »…). Permet la création et
la modification manuelle d'un lead, l'import CSV et l'export CSV filtré. C'est
aussi là que se règle l'arbitrage manuel des points (« points forcés » et leur
raison) sur un lead donné.

### Objectifs & primes (`/objectifs`)

Édition des objectifs d'une période (cible de points, paliers de primes sur le
volume et sur l'activation, prime marginale au-delà du dernier palier) et
simulation des primes obtenues avec les points et opportunités réels de la
période.

### Règles de comptage (`/regles`)

La référence métier lisible directement dans l'application : ce qui compte ou
non comme lead entrant, le système de points, l'ordre d'évaluation des règles
du moteur, un simulateur (« ce lead, il vaut combien ? ») et le réglage de
l'arbitrage newsletter × B2C.

### Intégrations (`/integrations`)

État et configuration des trois chemins d'entrée des leads (Slack, e-mail,
CSV) et de la synchronisation Notion : URL à renseigner côté Slack, exemple
d'appel pour l'ingestion e-mail, rappel des variables d'environnement
attendues, et panneau de connexion/synchronisation Notion.

## Comment les leads entrent

| Chemin | Ce qu'il faut configurer |
| --- | --- |
| Slack `#inbound` | Créer une app Slack, activer les Event Subscriptions sur `message.channels` (ou `message.groups`), pointer l'URL d'événements vers `/api/ingest/slack`, renseigner `SLACK_SIGNING_SECRET`, inviter l'app dans le canal. |
| Formulaires Webflow | Déclarer un webhook **Form submission** pointé vers `/api/ingest/webflow` et configurer son secret de signature dans `WEBFLOW_WEBHOOK_SECRET`. Le nom du formulaire devient le lead magnet du lead. |
| Make, Zapier, n8n | Appeler `POST /api/ingest/formulaire` avec l'identité, le contexte et, si votre scénario les connaît déjà, les dimensions qualifiées (`segment`, `relation`, `typeDemande`, `initiative`). Tout est facultatif : ce qui n'est pas fourni est déduit. |
| E-mails de formulaire | Relayer chaque e-mail de notification vers `POST /api/ingest/email` (un automatisme type Make, Zapier, n8n ou une règle Gmail), avec `INGEST_TOKEN` en en-tête `Authorization: Bearer`. |
| Import CSV | Aucune configuration : bouton « Importer » sur la page Leads, ou `POST /api/leads/import`. En-têtes reconnus en clair, valeurs acceptées en libellé ou en clé technique. |
| Saisie manuelle | Aucune configuration : formulaire sur la page Leads, ou `POST /api/leads`. |

Le scoring n'est jamais délégué à la source : une intégration transmet des
faits (segment, relation, type de demande, initiative), le dashboard applique
la règle et conserve son identifiant. Un scénario peut demander la valeur d'un
lead avant de l'envoyer, via `POST /api/score`.

Les leads issus de Slack, des formulaires et des e-mails passent par une classification
automatique (segment, relation, type de demande, initiative, identité) fondée
sur des règles de mots-clés et les paramètres UTM de l'URL d'origine. En
dessous du seuil de confiance (60 %), le lead est marqué **« à vérifier »**
plutôt que scoré sur une supposition : un humain tranche ensuite depuis la
page Leads.

## Mise en ligne et automatisation

Brancher Slack, les formulaires Webflow et Make demande une URL publique :
aucun webhook ne peut appeler `localhost`. La marche à suivre complète — déploiement
Vercel + Supabase, création de l'application Slack, webhook Webflow, scénario
Make avec les charges utiles exactes, et synchronisation Notion quotidienne — est
dans [`docs/AUTOMATISATION.md`](docs/AUTOMATISATION.md).

## Synchronisation Notion

Le dashboard reste la **source de vérité du scoring** : les points, l'éligibilité
et la règle appliquée sont toujours recalculés localement, jamais lus tels
quels depuis Notion. Notion reste un espace de travail confortable pour
l'équipe, où l'on peut modifier les champs métier (statut, segment, relation,
propriétaire…) ; ces modifications redescendent, sont re-scorées, puis
remontent corrigées.

**Connexion** : créer une intégration Notion interne, partager la page ou la
base cible avec elle, renseigner `NOTION_TOKEN` puis lancer la configuration —
soit via `npm run notion:setup`, soit via le bouton dédié de la page
Intégrations (`POST /api/notion/setup`). Selon ce qui est renseigné, le
dashboard rattache une base existante (`NOTION_DATABASE_ID`) en complétant les
propriétés manquantes, ou en crée une nouvelle sous une page parente
(`NOTION_PARENT_PAGE_ID`).

**Synchronisation** : bouton dédié dans la page Intégrations, `npm run
notion:sync` (avec `--pull` ou `--push` pour ne synchroniser que dans un sens),
ou `POST /api/notion/sync` (avec `?direction=pull` ou `?direction=push`). Sans
argument, le cycle descend d'abord (`pull`) puis remonte (`push`).

**Conflits** : dernier écrivain gagnant, en comparant l'horodatage
`last_edited_time` de la page Notion et `updated_at` du lead local. Si le
local est plus récent, la modification Notion est ignorée au `pull` — c'est le
`push` qui suivra qui écrasera la page Notion avec l'état local.

## Référence de l'API HTTP

Chaque accès est vérifié. Le **jeton d'ingestion**
(`INGEST_TOKEN`, en `Authorization: Bearer`) couvre l'ingestion e-mail et
formulaire. Le webhook Webflow utilise une signature HMAC. La **clé d'API**
(`API_KEY`, en `Authorization: Bearer`) couvre la lecture et l'écriture par des outils tiers. Les personnes passent
par Supabase Auth : choix de la personne et code d’accès. En
production, une configuration Auth incomplète ferme les pages et l'API sans clé.

| Méthode | Chemin | Rôle | Authentification |
| --- | --- | --- | --- |
| `GET` | `/api/leads` | Liste paginée des leads (filtres via query string : période, dates, segment, relation, type de demande, initiative, source, statut, éligibilité, « à vérifier », propriétaire, recherche `q`, tri, `limite`/`offset`). | Clé d'API |
| `POST` | `/api/leads` | Crée un lead (`schemaLeadInput`). Déduplique par défaut (`dedupliquer: false` pour forcer la création). | Clé d'API |
| `GET` | `/api/leads/{id}` | Détail d'un lead. | Clé d'API |
| `PATCH` | `/api/leads/{id}` | Met à jour un lead (patch partiel). Re-score automatiquement si une dimension du moteur change. | Clé d'API |
| `DELETE` | `/api/leads/{id}` | Suppression logique d'un lead. | Clé d'API |
| `POST` | `/api/leads/import` | Import en masse, depuis `{ csv: "..." }`, `{ leads: [...] }` ou un corps `text/csv` brut. Chaque ligne invalide est rejetée sans interrompre les autres (limite : 5000 lignes). | Clé d'API |
| `GET` | `/api/export` | Export CSV des leads (mêmes filtres que `/api/leads`), au format Excel FR (`;`, BOM UTF-8, virgule décimale). | Clé d'API |
| `POST` | `/api/ingest/slack` | Webhook d'événements Slack (`event_callback` sur les messages du canal, plus la confirmation `url_verification`). | Signature Slack (`SLACK_SIGNING_SECRET`) |
| `POST` | `/api/ingest/email` | Ingestion d'un e-mail de formulaire (`{ ... }`) ou d'un lot (`{ emails: [...] }`, 50 maximum). | Jeton d'ingestion |
| `POST` | `/api/ingest/webflow` | Webhook de soumission de formulaire Webflow (formats v1 et v2). | Signature Webflow obligatoire en production |
| `POST` | `/api/ingest/formulaire` | Ingestion générique appelée par Make, Zapier ou n8n : identité, contexte, et dimensions déjà qualifiées ou non. Un objet ou un lot (`{ leads: [...] }`, 100 maximum). | Jeton d'ingestion |
| `GET` `POST` | `/api/cron/{tache}` | Tâches planifiées : `notion-sync` (synchronisation bidirectionnelle) et `resume-periode` (état du trimestre en JSON). | `Authorization: Bearer $CRON_SECRET` |
| `GET` | `/api/health` | Sonde de santé : état minimal de la base. | Publique |
| `POST` | `/api/score` | Simulateur : calcule le score d'une combinaison segment/relation/type de demande/initiative sans rien écrire en base. | Clé d'API |
| `GET` | `/api/stats` | Statistiques agrégées d'une période (`?periode=2026-Q4`, sinon la période active). | Clé d'API |
| `GET` | `/api/objectifs` | Objectif d'une période (`?periode=...`) ou liste de tous les objectifs enregistrés. | Clé d'API |
| `PUT` | `/api/objectifs` | Crée ou met à jour l'objectif d'une période (cible de points, paliers, prime marginale). | Clé d'API |
| `GET` | `/api/reglages` | Réglages applicatifs courants (période active, arbitrage newsletter × B2C, fenêtre de déduplication). | Clé d'API |
| `PUT` | `/api/reglages` | Met à jour les réglages. Un changement d'arbitrage déclenche un recalcul de tous les leads déjà en base. | Clé d'API |
| `GET` | `/api/notion/status` | État de la connexion Notion (configuré ou non, base/data source rattachées, dernier `pull`, leads en attente de `push`, historique des dernières synchronisations). | Clé d'API |
| `POST` | `/api/notion/setup` | Rattache ou crée la base Notion (`{ databaseId? , parentPageId?, titre? }`). | Nécessite `NOTION_TOKEN` |
| `POST` | `/api/notion/sync` | Lance une synchronisation (`?direction=pull\|push`, sinon bidirectionnelle). | Nécessite `NOTION_TOKEN` |

Toutes les routes renvoient des réponses JSON (sauf `/api/export`, en CSV) et
un corps `{ erreur, details? }` en cas d'échec ; une erreur de validation Zod
renvoie un statut `422` avec le détail par champ.

## Scripts npm

| Script | Effet |
| --- | --- |
| `npm run dev` | Démarre le serveur de développement Next.js. |
| `npm run build` | Build de production. |
| `npm run start` | Démarre le serveur buildé. |
| `npm run lint` | Lint Next.js. |
| `npm run typecheck` | Vérification TypeScript sans émission (`tsc --noEmit`). |
| `npm test` | Lance la suite de tests une fois (Vitest). |
| `npm run test:watch` | Lance les tests en mode watch. |
| `npm run db:seed` | Génère le jeu de démonstration (`--reset` pour repartir d'une base vide). |
| `npm run notion:setup` | Rattache ou crée la base Notion depuis les variables d'environnement. |
| `npm run notion:sync` | Lance une synchronisation Notion (`--pull` ou `--push` pour un seul sens). |

## Architecture

```
src/
├── app/                    Pages (App Router) et routes API
│   ├── page.tsx                Vue d'ensemble
│   ├── leads/page.tsx           Page Leads
│   ├── objectifs/page.tsx       Page Objectifs & primes
│   ├── regles/page.tsx          Page Règles de comptage
│   ├── integrations/page.tsx    Page Intégrations
│   └── api/                    Routes API (voir tableau ci-dessus)
├── components/              Composants React (UI, graphiques, formulaires)
├── lib/
│   ├── domain/                 Logique métier pure, sans I/O, entièrement testée :
│   │                            taxonomie, scoring, objectifs/primes, classification,
│   │                            périodes, modèle de lead et sa validation Zod
│   ├── db/                     Persistance (node:sqlite, better-sqlite3, PostgreSQL) : leads, réglages,
│   │                            objectifs — seule couche qui parle SQL
│   ├── notion/                 Correspondance de schéma et synchronisation Notion
│   ├── ingest/                 Construction d'un lead à partir d'un message Slack
│   │                            ou d'un e-mail (classification + normalisation)
│   ├── api/http.ts             Utilitaires communs aux routes API (réponses, filtres,
│   │                            vérification du jeton d'ingestion)
│   ├── analytics.ts            Agrégations du dashboard (KPI, séries, répartitions)
│   ├── csv.ts                  Parsing et génération CSV sans dépendance externe
│   └── format.ts               Formatage d'affichage (dates, points, euros)
└── globals.css
```

Le principe d'architecture : **la logique métier est isolée dans
`src/lib/domain/`** (fonctions pures, sans accès disque ni réseau, couvertes
par des tests unitaires) et **la persistance est isolée dans `src/lib/db/`**.
Les routes API et les pages ne font qu'orchestrer ces deux couches ; aucune
règle de scoring ni de calcul de prime n'est dupliquée ailleurs.

## Tests

```bash
npm test
```

La suite (Vitest) couvre le domaine métier : le moteur de scoring et toutes
ses règles (y compris les deux arbitrages de l'ambiguïté newsletter × B2C),
le calcul des primes à paliers et des synthèses d'objectif, la classification
automatique d'un texte brut, le calcul des périodes trimestrielles, le modèle
de lead (validation, déduplication), le parsing CSV et la construction de
leads à partir d'un message Slack ou d'un e-mail.

## Base de données

SQLite par défaut, via le module `node:sqlite` intégré à Node — rien à
installer ni à compiler. Le fichier est créé automatiquement à `data/leads.db`
(chemin relatif au dossier du projet) au premier accès ; le chemin est
surchargeable par la variable d'environnement `DATABASE_PATH`.

Sur une version de Node antérieure à 22.5, qui n'expose pas encore
`node:sqlite`, l'application bascule sur `better-sqlite3` s'il est installé
(`npm install better-sqlite3`). Sans l'un ni l'autre, elle s'arrête au
démarrage avec un message qui rappelle les trois issues possibles : mettre Node
à jour, installer `better-sqlite3`, ou passer à PostgreSQL.

La variable `SQLITE_DRIVER` (`node` ou `better`) force un pilote précis ; elle
sert surtout à rejouer la suite de tests sur les deux implémentations.

### PostgreSQL / Supabase

Pour un hébergement sans disque persistant (Vercel, Netlify…), définissez
`DATABASE_URL` sur une chaîne de connexion PostgreSQL et l'application bascule
sans autre changement. Marche à suivre complète dans
[`docs/SUPABASE.md`](docs/SUPABASE.md).

## Variables d'environnement

Voir `.env.example` pour le détail complet, commenté. Résumé :

| Variable | Rôle | Obligatoire |
| --- | --- | --- |
| `DATABASE_PATH` | Chemin du fichier SQLite. | Non — par défaut `data/leads.db` |
| `DATABASE_URL` | Connexion PostgreSQL/Supabase côté serveur. | Oui sur Vercel |
| `DATABASE_SCHEMA_MANAGED` | `1` si le schéma est préparé dans Supabase et que le rôle du serveur ne peut pas créer de tables. | Oui avec un rôle PostgreSQL limité |
| `SUPABASE_DB_CA_CERT` | Certificat CA de la base pour valider TLS. | Selon le certificat utilisé par Supabase |
| `NEXT_PUBLIC_SUPABASE_URL` | URL publique de Supabase Auth. | Oui en production |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publiable de Supabase Auth. | Oui en production |
| `DASHBOARD_ALLOWED_EMAILS` | Adresses précises autorisées, côté serveur. | Oui en production |
| `NOTION_TOKEN` | Jeton de l'intégration Notion interne. | Non — sans elle, Notion reste désactivé |
| `NOTION_DATABASE_ID` | Base Notion à rattacher. | Non — sinon `NOTION_PARENT_PAGE_ID` ou la configuration via l'UI |
| `NOTION_PARENT_PAGE_ID` | Page parente sous laquelle créer la base Notion. | Non |
| `SLACK_SIGNING_SECRET` | Signing secret de l'app Slack, pour vérifier les webhooks. | Non — sans elle, l'ingestion Slack est fermée |
| `INGEST_TOKEN` | Jeton porteur attendu par `/api/ingest/email`. | Non — sans lui, cet endpoint est fermé |
| `APP_URL` | URL publique du dashboard, affichée dans les instructions de la page Intégrations. | Non |
