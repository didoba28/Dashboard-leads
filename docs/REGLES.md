# Règles de suivi et de validation des leads entrants

Référence métier du pôle Growth. Le moteur de scoring (`src/lib/domain/scoring.ts`)
implémente littéralement ce document : chaque lead scoré conserve l'identifiant
de la règle qui l'a décidé (`regleId`), ce qui rend chaque point affiché sur le
dashboard justifiable. Ce document doit rester synchronisé avec le code ; en cas
de doute, le code fait foi.

## Ce qui compte comme lead entrant

- Nouveau prospect entrant via lead magnet, formulaire ou site internet.
- Appel entrant issu du site internet.
- Téléchargement du livre blanc, d'un catalogue, ou simulateur rempli depuis le
  site.
- Prospect collectivité non client ayant téléchargé une fiche technique.

## Ce qui ne compte jamais comme lead entrant

- Un distributeur existant qui télécharge une fiche technique (ou toute autre
  ressource).
- Un renouvellement client.
- Plus généralement, tout compte déjà client : la règle ne retient que les
  prospects « ni client, ni distributeur existant ».

Ces trois cas valent **0 point**, ne comptent **jamais** dans les leads
activés/réactivés par l'inbound, et ce quels que soient le segment, le type de
demande ou l'initiative.

## Système de points

- **1 point** — demande entrante d'un prospect B2B ou collectivité non client
  (formulaire, fiche technique, livre blanc, catalogue, simulateur, appel
  entrant), ou lead magnet poussé par la **newsletter** (initiative 100 %
  Growth).
- **0,5 point** — demande entrante d'un prospect **B2C**, ou lead magnet servi
  par une initiative **outbound** (campagne de prospection ou BDR), quel que
  soit le segment du prospect.

## Lead magnet outbound vs newsletter

Un même contenu téléchargeable (fiche technique, livre blanc, catalogue,
simulateur…) ne vaut pas la même chose selon ce qui l'a poussé jusqu'au
prospect :

- servi par une **campagne outbound** ou un **BDR** : 0,5 point, et **exclu**
  du compteur d'opportunités activées/réactivées par l'inbound — c'est de la
  prospection sortante, pas un lead entrant au sens strict ;
- servi par la **newsletter** : 1 point plein, et éligible à l'activation —
  c'est une initiative issue exclusivement du pôle Growth.

Dans le code, cette distinction ne dépend que de l'**initiative**, pas du type
de demande précis : n'importe quelle demande envoyée sous une initiative
outbound vaut 0,5 point non activable, et n'importe quelle demande envoyée
sous l'initiative newsletter vaut 1 point activable (sous réserve de
l'arbitrage B2C décrit plus bas).

## Tableau de décision

Cases vides = n'importe quelle valeur de la dimension (le résultat ne varie
pas avec elle). « Autre initiative inbound » regroupe `inbound_site`,
`salon_evenement`, `reseaux_sociaux`, `bouche_a_oreille` et `inconnue`.

| Segment | Relation | Type de demande | Initiative | Points | Éligible activation | Règle |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | `renouvellement_client` | — | 0 | Non | `exclusion.renouvellement` |
| — | Distributeur | (autre que renouvellement) | — | 0 | Non | `exclusion.distributeur` |
| — | Client | (autre que renouvellement) | — | 0 | Non | `exclusion.client` |
| B2B | Prospect | (autre que renouvellement) | Outbound (campagne ou BDR) | 0,5 | Non | `outbound.lead_magnet` |
| B2C | Prospect | (autre que renouvellement) | Outbound (campagne ou BDR) | 0,5 | Non | `outbound.lead_magnet` |
| Collectivité | Prospect | (autre que renouvellement) | Outbound (campagne ou BDR) | 0,5 | Non | `outbound.lead_magnet` |
| B2B | Prospect | (autre que renouvellement) | Newsletter | 1 | Oui | `newsletter.lead_magnet` |
| Collectivité | Prospect | (autre que renouvellement) | Newsletter | 1 | Oui | `newsletter.lead_magnet` |
| B2C | Prospect | (autre que renouvellement) | Newsletter — arbitrage `newsletter` (défaut) | 1 | Oui | `newsletter.lead_magnet` |
| B2C | Prospect | (autre que renouvellement) | Newsletter — arbitrage `segment` | 0,5 | Oui | `inbound.b2c` |
| B2C | Prospect | (autre que renouvellement) | Autre initiative inbound | 0,5 | Oui | `inbound.b2c` |
| B2B | Prospect | (autre que renouvellement) | Autre initiative inbound | 1 | Oui | `inbound.b2b` |
| Collectivité | Prospect | (autre que renouvellement) | Autre initiative inbound | 1 | Oui | `inbound.b2b` |

Ce tableau est vérifié contre `src/lib/domain/scoring.test.ts`, qui teste en
outre la totalité des combinaisons possibles de la taxonomie (segments ×
relations × types de demande × initiatives) pour garantir qu'aucune n'échappe
à ces sept règles.

## Ordre d'évaluation

Le moteur applique les règles **dans l'ordre**, et la première dont la
condition est vraie décide :

1. `exclusion.renouvellement`
2. `exclusion.distributeur`
3. `exclusion.client`
4. `outbound.lead_magnet`
5. `newsletter.lead_magnet`
6. `inbound.b2c`
7. `inbound.b2b` (filet de sécurité : condition toujours vraie)

Les trois exclusions passent en premier **avant** l'examen de l'initiative ou
du segment : un distributeur ou un compte déjà client ne devient jamais un
lead entrant, quelle que soit l'initiative qui l'a touché — y compris une
initiative newsletter ou outbound. C'est délibéré : le statut de la relation
commerciale prime sur la façon dont le contact a été généré.

## Le cas ambigu : lead magnet newsletter rempli par un B2C

Un lead magnet poussé en newsletter et rempli par un prospect B2C fait se
recouper deux règles écrites par l'équipe :

- la règle « newsletter » dit qu'un lead magnet poussé par cette initiative
  100 % Growth compte pour 1 point ;
- la grille de points dit qu'une demande entrante B2C vaut 0,5 point.

Deux lectures sont donc possibles, et les règles écrites ne tranchent pas
explicitement laquelle prime. Le dashboard rend ce choix explicite via le
réglage **`arbitrageB2cNewsletter`** :

- **`newsletter`** (valeur par défaut) — l'initiative prime : le lead vaut
  **1 point**, quel que soit le segment.
- **`segment`** — la grille de points prime : un B2C vaut **0,5 point**, même
  via la newsletter.

Ce réglage se change depuis la page **Règles de comptage** (`/regles`), dans
le bloc « Arbitrage : newsletter × B2C » du simulateur, ou via
`PUT /api/reglages` (`{ "arbitrageB2cNewsletter": "newsletter" | "segment" }`).
Changer ce réglage **recalcule tous les leads déjà enregistrés** : les points,
l'éligibilité et la règle appliquée de chaque lead existant sont
recalculés — pas seulement les leads futurs.

## Arbitrage manuel

Chaque lead porte un champ **« points forcés »** (`pointsOverride`), qui ne
peut valoir que 0, 0,5 ou 1, accompagné d'une **raison**
(`pointsOverrideRaison`). Quand il est renseigné, il **prime sur le calcul
automatique** du moteur de scoring dans tous les indicateurs du dashboard
(KPI, séries, export, synchronisation Notion) — l'explication et
l'identifiant de règle affichés restent ceux du calcul automatique, à titre
de comparaison. Ce champ se renseigne depuis le formulaire d'un lead, sur la
page Leads.

## Objectifs et primes

Deux dispositifs de prime, indépendants et cumulables, tous deux à **paliers
non cumulatifs** : seul le montant du **plus haut palier atteint** est
retenu, jamais la somme des paliers franchis.

- **Volume de points** : un objectif de points sur le trimestre. Aucune prime
  marginale au-delà du dernier palier — le montant plafonne.
- **Activation** : des paliers d'opportunités activées ou réactivées par
  l'inbound, plus un **montant linéaire par opportunité** au-delà du dernier
  palier.

### Barème par défaut (T4 2026)

| Dispositif | Palier | Prime |
| --- | --- | --- |
| Volume de points | 60 points | 200 € |
| Activation | 15 opportunités | 200 € |
| Activation | 20 opportunités | 300 € |
| Activation | 25 opportunités | 400 € |
| Activation (au-delà) | par opportunité supplémentaire | +20 € |

### Exemples chiffrés (vérifiés contre `objectives.test.ts`)

| Dispositif | Valeur atteinte | Prime |
| --- | --- | --- |
| Points | 59,5 pt | 0 € (il manque 0,5 pt pour le palier à 60) |
| Points | 60 pt | 200 € |
| Points | 120 pt | 200 € (plafonné, pas de prime marginale sur le volume) |
| Activation | 14 opp. | 0 € |
| Activation | 15 opp. | 200 € |
| Activation | 19 opp. | 200 € |
| Activation | 20 opp. | 300 € |
| Activation | 24 opp. | 300 € |
| Activation | 25 opp. | 400 € |
| Activation | 26 opp. | 420 € (400 € + 1 × 20 €) |
| Activation | 28 opp. | 460 € (400 € + 3 × 20 €) |
| Activation | 30 opp. | 500 € (400 € + 5 × 20 €) |
| Les deux ensemble | 62 pt et 20 opp. | 500 € (200 € de volume + 300 € d'activation) |

L'ordre de saisie des paliers n'a aucune influence sur le calcul (ils sont
triés par seuil avant évaluation).

## Déduplication

Un doublon est détecté sur la combinaison **même identité + même ressource +
même journée** : l'identité est l'e-mail (normalisé), à défaut le téléphone, à
défaut la société ; la ressource est le nom du lead magnet téléchargé, à
défaut le type de demande. Deux leads partageant ces trois éléments pour la
même `dateReception` sont considérés comme le même événement. La fenêtre de
recherche du doublon (combien de jours en arrière on regarde) est réglable
(`fenetreDedupeJours`, 30 jours par défaut) ; un lead sans identité exploitable
n'est jamais dédupliqué.

## Période de rattachement

C'est la **date de réception** du lead (`dateReception`) qui détermine son
trimestre de rattachement (ex. une date en octobre, novembre ou décembre 2026
rattache le lead à `2026-Q4`) — jamais la date de création de
l'enregistrement en base ni celle d'une éventuelle synchronisation Notion.
Un lead saisi tardivement pour un événement passé compte donc bien sur la
période où l'événement a eu lieu.
