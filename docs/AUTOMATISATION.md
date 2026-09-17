# Mettre le dashboard en pilote automatique

Ce document part d'une application qui tourne en local et l'amène à un
dashboard qui se remplit tout seul. L'ordre compte : chaque étape suppose la
précédente.

## Le flux visé

```
Slack #inbound  ─┐
Formulaires Webflow ─┼──►  /api/ingest/*  ──►  moteur de règles  ──►  base
E-mails via Make ─┘                                                    │
                                                                       ▼
                                          tâche planifiée quotidienne ──► Notion
```

Trois portes d'entrée, un seul moteur de scoring, une base, et Notion tenu à
jour en arrière-plan. Le dashboard reste la source de vérité des points :
aucune des sources ne décide combien vaut un lead.

## Étape 1 — Déployer (le prérequis de tout le reste)

Aucun webhook ne peut appeler `localhost`. Tant que l'application tourne sur un
poste, il n'y a pas d'automatisation possible. C'est la première chose à faire,
pas la dernière.

### 1.1 La base Supabase

1. Créez un projet sur [supabase.com](https://supabase.com).
2. **Project Settings → Database → Connection string**, onglet `URI`. Prenez la
   chaîne du **connection pooler** (port `6543`) : Vercel ouvre beaucoup de
   connexions courtes, le pooler est fait pour ça.
3. Remplacez `[YOUR-PASSWORD]` par le mot de passe de la base.

Le détail, y compris la reprise des données existantes, est dans
[`SUPABASE.md`](SUPABASE.md).

### 1.2 Le déploiement Vercel

1. Sur [vercel.com](https://vercel.com), **Add New → Project**, importez le
   dépôt GitHub et sélectionnez la branche.
2. Vercel détecte Next.js tout seul : ne touchez pas aux commandes de build.
3. Renseignez les variables d'environnement ci-dessous, puis déployez.

| Variable | Valeur |
| --- | --- |
| `DATABASE_URL` | la chaîne Supabase de l'étape 1.1 |
| `SUPABASE_DB_CA_CERT` | le certificat CA PEM de la base si nécessaire à la validation TLS |
| `NEXT_PUBLIC_SUPABASE_URL` | l'URL du projet Supabase Auth |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la clé publiable Supabase Auth |
| `DASHBOARD_ALLOWED_EMAILS` | les adresses e-mail exactes autorisées, séparées par des virgules |
| `INGEST_TOKEN` | une chaîne aléatoire que vous générez |
| `CRON_SECRET` | une autre chaîne aléatoire |
| `API_KEY` | une troisième chaîne aléatoire |
| `APP_URL` | l'URL publique du projet, par exemple `https://leads.vercel.app` |

Pour générer un secret solide :

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### 1.3 Vérifier

```bash
curl https://VOTRE-URL/api/health
```

Vous devez lire `"statut":"ok"`. Cette route publique ne révèle que l'état
de la base et peut être surveillée par un service d'uptime.

## Étape 2 — Slack `#inbound`

1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From
   scratch**, choisissez l'espace de travail.
2. **Basic Information → App Credentials** : copiez le **Signing Secret** dans
   la variable `SLACK_SIGNING_SECRET` sur Vercel, puis redéployez.
3. **Event Subscriptions** → activez, et renseignez comme **Request URL** :
   `https://VOTRE-URL/api/ingest/slack`
   Slack envoie immédiatement un défi de vérification ; l'endpoint y répond.
   Pas de jeton dans l'URL ici : c'est la signature cryptographique qui
   protège cet endpoint, et elle est plus solide qu'un jeton en clair.
4. **Subscribe to bot events** → ajoutez `message.channels` (canal public) ou
   `message.groups` (canal privé). Enregistrez, puis réinstallez l'application
   quand Slack le propose.
5. Dans Slack, invitez l'application : `/invite @NomDeLApp` dans `#inbound`.

Chaque message du canal devient un lead, classé automatiquement. Quand la
classification est peu sûre, le lead est marqué « à vérifier » plutôt que
scoré sur une supposition — vous les retrouvez avec le filtre du même nom.

Chaque requête est vérifiée par signature HMAC : une requête non signée, mal
signée ou vieille de plus de cinq minutes est rejetée.

## Étape 3 — Les formulaires Webflow

Webflow sait appeler une URL à chaque soumission de formulaire.

1. Dans les réglages du site Webflow : **Site settings → Integrations →
   Webhooks → Add Webhook**.
2. Trigger type : **Form submission**.
3. URL : `https://VOTRE-URL/api/ingest/webflow`

Récupérez la clé de signature de ce webhook dans Webflow et placez-la dans
`WEBFLOW_WEBHOOK_SECRET` : le serveur vérifie obligatoirement la signature en
production. Aucun secret n'est inclus dans l'URL. Les webhooks créés avec
un jeton de site récent disposent de leur propre clé ; ceux d'une app OAuth
utilisent le secret client de l'app.

Le nom du formulaire Webflow devient le **lead magnet** du lead. Nommez donc
vos formulaires pour ce qu'ils sont — « Téléchargement catalogue 2026 »,
« Simulateur Plan 5000 » — plutôt que « Formulaire 3 » : c'est ce qui
alimentera le classement des meilleures ressources.

Les noms de champs sont reconnus en clair et de façon tolérante (`Nom`,
`Email`, `Organisme`, `Collectivité`, `Téléphone`, `Message`…), accents et
majuscules compris.

## Étape 4 — Make : les e-mails et l'enrichissement

C'est ici que Make travaille : chercher, enrichir, qualifier. Mais **il
n'attribue pas les points**. Il envoie les faits, le dashboard applique la
règle. Sinon deux moteurs de règles cohabitent et divergent au premier
changement de barème.

### Le scénario

1. **Watch emails** (Gmail / Outlook) sur le libellé ou le filtre qui reçoit
   les notifications de formulaire.
2. Vos modules d'enrichissement et de qualification : déterminer s'il s'agit
   d'un B2B, d'un B2C ou d'une collectivité, si le compte est déjà client ou
   distributeur, quelle initiative est à l'origine du contact.
3. **HTTP → Make a request** vers le dashboard.

### La requête

```
POST https://VOTRE-URL/api/ingest/formulaire
Authorization: Bearer VOTRE_INGEST_TOKEN
Content-Type: application/json
```

```json
{
  "email": "m.dupont@mairie-lyon.fr",
  "nom": "Marie Dupont",
  "societe": "Mairie de Lyon",
  "ville": "Lyon",
  "sujet": "Demande de catalogue",
  "message": "Bonjour, pourriez-vous m'envoyer votre catalogue 2026 ?",
  "segment": "Collectivité",
  "relation": "Prospect",
  "typeDemande": "Catalogue",
  "initiative": "Newsletter",
  "campagne": "NL octobre",
  "recuLe": "2026-10-05"
}
```

Les quatre dimensions acceptent aussi bien le libellé français
(`"Collectivité"`, `"Newsletter"`) que la clé technique (`"collectivite"`,
`"newsletter"`) — utilisez ce qui sort le plus naturellement de votre scénario.

**Tout est facultatif.** Envoyez seulement `sujet` et `message` et le dashboard
classera lui-même ; le lead sera marqué « à vérifier » si le doute est trop
grand. Chaque dimension que Make fournit remplace la déduction correspondante.
Plus Make en sait, moins le dashboard devine.

### Savoir ce que vaut un lead avant de l'envoyer

Si votre scénario doit brancher selon la valeur du lead, demandez-la :

```
POST https://VOTRE-URL/api/score
Authorization: Bearer VOTRE_API_KEY
Content-Type: application/json

{ "segment": "b2b", "relation": "prospect",
  "typeDemande": "livre_blanc", "initiative": "outbound_campagne" }
```

Réponse : les points, l'éligibilité à l'activation, et la règle appliquée avec
son explication. Un seul endroit décide, et il sait dire pourquoi.

### Forcer une valeur

En dernier recours, `"pointsForces": 0.5` avec `"raisonPointsForces": "…"`
impose une valeur. Elle apparaît dans le dashboard comme arbitrage manuel,
distincte du calcul automatique, et la raison est conservée. À réserver aux cas
que la règle ne sait pas trancher.

### Envoyer un lot

`{ "leads": [ {...}, {...} ] }`, jusqu'à 100 par appel. Une entrée invalide
n'interrompt pas les autres : la réponse indique ce qui est passé et ce qui a
échoué, entrée par entrée.

### Les doublons

Inutile de vous en préoccuper dans Make : le dashboard ignore un lead déjà reçu
le même jour pour la même personne et la même ressource, et vous le signale
dans la réponse (`"doublon": true`).

## Étape 5 — Notion en continu

Le fichier `vercel.json` déclare une synchronisation **chaque jour à 05:00 UTC**.
Elle s'active dès que `CRON_SECRET` est défini sur le projet — Vercel transmet
le secret automatiquement, vous n'avez rien à configurer de plus.

Cette fréquence fonctionne aussi sur Vercel Hobby, qui n'accepte pas de tâche
plus fréquente qu'une fois par jour. Pour une synchronisation horaire, utilisez
Vercel Pro ou programmez un appel à `/api/cron/notion-sync` depuis Make avec
`Authorization: Bearer VOTRE_CRON_SECRET`.

Prérequis : `NOTION_TOKEN` renseigné et une base connectée (page
**Intégrations** du dashboard, ou `npm run notion:setup`).

Sur Vercel Pro, pour passer à une fréquence de 15 minutes, modifiez `vercel.json` :

```json
{ "crons": [ { "path": "/api/cron/notion-sync", "schedule": "*/15 * * * *" } ] }
```

Hors Vercel, n'importe quel ordonnanceur fait l'affaire :

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://VOTRE-URL/api/cron/notion-sync
```

Une seconde tâche, `/api/cron/resume-periode`, renvoie l'état du trimestre en
JSON — points, opportunités, prime projetée, leads à vérifier. Branchez-la sur
un scénario Make hebdomadaire pour recevoir le récapitulatif dans Slack.

## Étape 6 — Fermer l'API

Dès que `API_KEY` est définie, les scripts tiers peuvent accéder aux routes de
lecture et d'écriture avec `Authorization: Bearer VOTRE_API_KEY`. L'interface
utilise une session Supabase réservée aux adresses autorisées et vérifiée par
un code TOTP. Une configuration Auth incomplète rend l'interface indisponible en
production au lieu d'exposer les données. Le guide complet figure dans
[`SUPABASE.md`](SUPABASE.md).

Les routes d'ingestion ne sont pas concernées — elles ont leur propre secret — ni
`/api/health`, volontairement publique.

## Récapitulatif des secrets

| Secret | Protège | Qui le présente |
| --- | --- | --- |
| `INGEST_TOKEN` | `/api/ingest/email`, `/formulaire` | Make et relais e-mail |
| `SLACK_SIGNING_SECRET` | signature des requêtes Slack | Slack (automatique) |
| `WEBFLOW_WEBHOOK_SECRET` | signature Webflow, obligatoire en production | Webflow (automatique) |
| `API_KEY` | lecture et écriture de l'API | outils tiers |
| `CRON_SECRET` | `/api/cron/*` | l'ordonnanceur |
| `DATABASE_URL` | la base | l'application seule |

Les secrets (`DATABASE_URL`, `SUPABASE_DB_CA_CERT`, `DASHBOARD_ALLOWED_EMAILS`,
`API_KEY`, `INGEST_TOKEN`, `CRON_SECRET` et signatures) restent côté serveur.
Seules `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
sont publiques par conception.

## Vérifier que la chaîne fonctionne

1. `curl https://VOTRE-URL/api/health` → `"statut":"ok"`.
2. Postez un message dans `#inbound` mentionnant une demande de catalogue avec
   une adresse e-mail. Il doit apparaître dans **Leads** en quelques secondes.
3. Soumettez un formulaire de test sur le site Webflow. Même vérification.
4. Déclenchez le scénario Make à la main sur un e-mail réel.
5. Après la tâche quotidienne (ou un appel manuel à la route de synchronisation), ouvrez la base Notion : les leads doivent y
   être. La page **Intégrations** affiche le journal des synchronisations, avec
   les erreurs éventuelles.

Si une source ne remonte rien, l'ordre de diagnostic est toujours le même :
la sonde de santé, puis le journal du fournisseur (Slack affiche les échecs de
livraison dans **Event Subscriptions**, Webflow dans les journaux du webhook,
Make dans l'historique du scénario), puis les logs de Vercel.
