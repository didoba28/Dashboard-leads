#!/usr/bin/env npx tsx
/**
 * Génère un jeu de démonstration réaliste et déterministe (PRNG seedé,
 * aucun `Math.random`) pour AirFit : ~140 leads sur 2026-Q3 et 2026-Q4.
 *
 * Usage : npx tsx scripts/seed.ts [--reset]
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '@/lib/db';
import { creerLead, listerTousLeads } from '@/lib/db/leads';
import { ecrireObjectif } from '@/lib/db/settings';
import { estOpportuniteInbound, pointsDuLead, schemaLeadInput } from '@/lib/domain/lead';
import { OBJECTIF_DEFAUT } from '@/lib/domain/objectives';
import {
  TYPES_LEAD_MAGNET,
  type Initiative,
  type Relation,
  type Segment,
  type SourceCollecte,
  type Statut,
  type TypeDemande,
} from '@/lib/domain/taxonomy';

// --- Chargement de l'environnement (.env.local puis .env) ----------------------

function chargerEnv(): void {
  for (const nom of ['.env.local', '.env']) {
    const chemin = path.join(process.cwd(), nom);
    if (!fs.existsSync(chemin)) continue;
    const contenu = fs.readFileSync(chemin, 'utf8');
    for (const ligneBrute of contenu.split('\n')) {
      const ligne = ligneBrute.trim();
      if (!ligne || ligne.startsWith('#')) continue;
      const idx = ligne.indexOf('=');
      if (idx === -1) continue;
      const cle = ligne.slice(0, idx).trim();
      let valeur = ligne.slice(idx + 1).trim();
      if ((valeur.startsWith('"') && valeur.endsWith('"')) || (valeur.startsWith("'") && valeur.endsWith("'"))) {
        valeur = valeur.slice(1, -1);
      }
      if (process.env[cle] === undefined) process.env[cle] = valeur;
    }
  }
}

chargerEnv();

// --- PRNG seedé (mulberry32) — déterministe, pas de Math.random ---------------

const SEED = 424242;

function mulberry32(seed: number): () => number {
  let t = seed;
  return function next() {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);

function pickArr<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function pondere<T>(options: [T, number][]): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [val, w] of options) {
    if (r < w) return val;
    r -= w;
  }
  return options[options.length - 1]![0];
}

function telephoneAleatoire(): string {
  const indicatif = 1 + Math.floor(rng() * 5);
  const groupes = Array.from({ length: 4 }, () => String(Math.floor(rng() * 100)).padStart(2, '0'));
  return `0${indicatif} ${groupes.join(' ')}`;
}

/** offset (0..183) → date dans [2026-07-01, 2026-12-31]. */
function dateDepuisOffset(offsetJours: number): string {
  const base = Date.UTC(2026, 6, 1);
  return new Date(base + offsetJours * 86_400_000).toISOString().slice(0, 10);
}

const estQ4 = (date: string): boolean => date >= '2026-10-01';

function sansAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// --- Données de démonstration (noms d'organismes et de villes français) --------

const VILLES = [
  'Lyon', 'Marseille', 'Toulouse', 'Nantes', 'Strasbourg', 'Bordeaux', 'Lille', 'Rennes',
  'Reims', 'Le Havre', 'Saint-Étienne', 'Toulon', 'Grenoble', 'Dijon', 'Angers', 'Nîmes',
  'Villeurbanne', 'Le Mans', 'Aix-en-Provence', 'Clermont-Ferrand', 'Tours', 'Amiens',
  'Limoges', 'Annecy', 'Perpignan', 'Besançon', 'Orléans', 'Metz', 'Rouen', 'Mulhouse',
] as const;

const PRENOMS = [
  'Julien', 'Camille', 'Antoine', 'Léa', 'Nicolas', 'Manon', 'Thomas', 'Chloé', 'Maxime',
  'Sarah', 'Alexandre', 'Emma', 'Romain', 'Laura', 'Mathieu', 'Julie', 'Benjamin', 'Charlotte',
  'Vincent', 'Marion',
] as const;

const NOMS = [
  'Marchand', 'Lefort', 'Girard', 'Bonnet', 'Roussel', 'Fontaine', 'Perrin', 'Morel',
  'Lambert', 'Faure', 'Gauthier', 'Dumas', 'Vidal', 'Renard', 'Chevalier', 'Brunet',
  'Barbier', 'Guyot', 'Legrand', 'Masson',
] as const;

const ORGANISMES_B2B = [
  "Bureau d'études Arboris", 'Paysages du Rhône', 'Groupe Sportéo', 'Atelier Vert Urbain',
  'Cabinet Urbanova', 'Sportivia Concept', 'Nordest Aménagement', "Bureau d'études Cité Verte",
  'Ecla Paysage', 'Groupe Actifs Publics', 'Atelier des Espaces Sportifs', 'Studio Extérieur Fitness',
  "Cabinet Ingénierie Sports", 'Vertige Paysage', "Bureau d'études Sylva", 'Aréna Concept',
  'Forme Urbaine SAS', 'Groupe Loisirs & Nature', 'Cabinet Horizon Sport', 'Paysagistes Associés du Sud',
] as const;

const ORGANISMES_DISTRIBUTEUR = [
  'Equip Sport Diffusion', 'Loisirs Plein Air Distribution', 'ActivMat Négoce', 'Sportéquip France',
] as const;

const FONCTIONS_B2B = [
  "Chef de projet aménagement", 'Responsable achats', 'Architecte paysagiste', 'Directeur technique',
  "Chargé d'affaires", 'Responsable développement',
] as const;

const FONCTIONS_COLLECTIVITE = [
  'Directeur des services techniques', 'Chargé de mission sport', 'Responsable espaces verts',
  'Adjoint aux sports', 'Chef de projet urbanisme', 'Directrice des sports',
] as const;

const LEAD_MAGNETS = [
  'Fiche technique — Parcours de fitness extérieur',
  'Livre blanc — Aménager une aire de fitness urbaine',
  'Catalogue Agrès 2026',
  'Simulateur de subvention Plan 5000',
  'Fiche technique — Agrès inclusifs',
  "Livre blanc — Financer un espace sportif extérieur",
] as const;

const CAMPAGNES_OUTBOUND = [
  'Campagne Collectivités Automne 2026',
  "Prospection BDR Bureaux d'études",
  'Campagne Plan 5000 Q3',
  'Campagne Plan 5000 Q4',
] as const;

const CAMPAGNES_NEWSLETTER = [
  'Newsletter Growth #12', 'Newsletter Growth #13', 'Newsletter Growth #14', 'Newsletter Growth #15',
] as const;

const PROPRIETAIRES = ['Camille Roy', 'Hugo Lefèvre', 'Nina Castel'] as const;

const TAGS_POOL = ['plan5000', 'urgent', 'budget2027', 'subvention', 'multi-sites', 'suivi-salon'] as const;

const MESSAGES_PAR_TYPE: Partial<Record<TypeDemande, string>> = {
  formulaire_contact: "Bonjour, nous souhaitons échanger sur un projet d'aménagement extérieur.",
  demande_prix: 'Pourriez-vous nous transmettre un devis pour l’installation d’agrès sportifs ?',
  fiche_technique: 'Je télécharge votre fiche technique pour étudier la faisabilité du projet.',
  livre_blanc: 'Intéressé par votre livre blanc sur les aires de fitness urbaines.',
  catalogue: 'Merci de nous transmettre votre catalogue complet 2026.',
  simulateur: 'Nous testons le simulateur de subvention pour notre budget 2027.',
  appel_entrant: "Appel reçu au sujet d'un projet d'aire de fitness.",
  lead_magnet_autre: 'Téléchargement de contenu sur le site.',
  renouvellement_client: 'Suivi de contrat existant, renouvellement à prévoir.',
};

// --- Génération -----------------------------------------------------------------

interface LeadGenere {
  dateReception: string;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  societe: string | null;
  fonction: string | null;
  ville: string | null;
  segment: Segment;
  relation: Relation;
  typeDemande: TypeDemande;
  initiative: Initiative;
  sourceCollecte: SourceCollecte;
  campagne: string | null;
  leadMagnet: string | null;
  message: string | null;
  statut: Statut;
  proprietaire: string | null;
  tags: string[];
  aVerifier: boolean;
  confiance: number | null;
}

const N = 140;
const TYPES_DEMANDE_GENERAUX: TypeDemande[] = [
  'formulaire_contact', 'demande_prix', 'fiche_technique', 'livre_blanc',
  'catalogue', 'simulateur', 'appel_entrant', 'lead_magnet_autre',
];

function genererUnLead(): LeadGenere {
  const offsetJours = Math.floor(rng() * 184);
  const dateReception = dateDepuisOffset(offsetJours);

  const segment = pondere<Segment>([
    ['collectivite', 0.45],
    ['b2b', 0.35],
    ['b2c', 0.2],
  ]);

  const relation = pondere<Relation>([
    ['prospect', 0.85],
    ['client', 0.1],
    ['distributeur', 0.05],
  ]);

  const initiative = pondere<Initiative>([
    ['outbound_campagne', 0.1],
    ['outbound_bdr', 0.1],
    ['newsletter', 0.15],
    ['inbound_site', 0.65],
  ]);

  const typeDemande: TypeDemande =
    relation === 'client' && rng() < 0.5 ? 'renouvellement_client' : pickArr(TYPES_DEMANDE_GENERAUX);

  const estLeadMagnet = (TYPES_LEAD_MAGNET as readonly TypeDemande[]).includes(typeDemande);

  let nom: string | null = null;
  let societe: string | null = null;
  let fonction: string | null = null;
  let ville: string | null = pickArr(VILLES);

  if (segment === 'collectivite') {
    societe = pondere<string>([
      [`Mairie de ${ville}`, 0.5],
      [`CCAS de ${ville}`, 0.2],
      [`Communauté de communes du Pays de ${ville}`, 0.15],
      [`Communauté d'agglomération de ${ville}`, 0.15],
    ]);
    nom = `${pickArr(PRENOMS)} ${pickArr(NOMS)}`;
    fonction = pickArr(FONCTIONS_COLLECTIVITE);
  } else if (segment === 'b2b') {
    societe = relation === 'distributeur' ? pickArr(ORGANISMES_DISTRIBUTEUR) : pickArr(ORGANISMES_B2B);
    nom = `${pickArr(PRENOMS)} ${pickArr(NOMS)}`;
    fonction = pickArr(FONCTIONS_B2B);
  } else {
    nom = `${pickArr(PRENOMS)} ${pickArr(NOMS)}`;
  }

  const emailLocal = sansAccents(nom).toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
  const domaine = societe
    ? `${sansAccents(societe).toLowerCase().replace(/[^a-z0-9]+/g, '')}.fr`
    : 'exemple.fr';
  const email = `${emailLocal}@${domaine}`;

  const sourceCollecte = pondere<SourceCollecte>([
    ['site_web', 0.35],
    ['email_formulaire', 0.25],
    ['slack_inbound', 0.15],
    ['telephone', 0.1],
    ['notion', 0.05],
    ['manuel', 0.1],
  ]);

  let campagne: string | null = null;
  if (initiative === 'outbound_campagne' || initiative === 'outbound_bdr') {
    campagne = pickArr(CAMPAGNES_OUTBOUND);
  } else if (initiative === 'newsletter') {
    campagne = pickArr(CAMPAGNES_NEWSLETTER);
  }

  const leadMagnet = estLeadMagnet ? pickArr(LEAD_MAGNETS) : null;

  const statut = pondere<Statut>([
    ['nouveau', 0.28],
    ['a_qualifier', 0.2],
    ['qualifie', 0.2],
    ['non_qualifie', 0.15],
    ['perdu', 0.1],
    ['active', 0.05],
    ['reactive', 0.02],
  ]);

  const aVerifier = rng() < 0.08;
  const confiance = aVerifier ? Math.round((0.2 + rng() * 0.35) * 100) / 100 : null;

  const nbTags = Math.floor(rng() * 3);
  const tags: string[] = [];
  for (let k = 0; k < nbTags; k++) {
    const t = pickArr(TAGS_POOL);
    if (!tags.includes(t)) tags.push(t);
  }

  return {
    dateReception,
    nom,
    email,
    telephone: telephoneAleatoire(),
    societe,
    fonction,
    ville,
    segment,
    relation,
    typeDemande,
    initiative,
    sourceCollecte,
    campagne,
    leadMagnet,
    message: MESSAGES_PAR_TYPE[typeDemande] ?? null,
    statut,
    proprietaire: pickArr(PROPRIETAIRES),
    tags,
    aVerifier,
    confiance,
  };
}

const leadsGeneres: LeadGenere[] = Array.from({ length: N }, () => genererUnLead());

// Garantit une vingtaine d'opportunités (active/reactive) éligibles sur le T4.
const CIBLE_OPPORTUNITES_T4 = 20;
const estCandidatOpportunite = (l: LeadGenere): boolean =>
  estQ4(l.dateReception) &&
  l.relation === 'prospect' &&
  l.typeDemande !== 'renouvellement_client' &&
  (l.initiative === 'inbound_site' || l.initiative === 'newsletter');

let opportunitesT4 = leadsGeneres.filter(
  (l) => estCandidatOpportunite(l) && (l.statut === 'active' || l.statut === 'reactive'),
).length;

const candidatsPromotion = leadsGeneres.filter(
  (l) => estCandidatOpportunite(l) && l.statut !== 'active' && l.statut !== 'reactive',
);
for (let i = 0; opportunitesT4 < CIBLE_OPPORTUNITES_T4 && i < candidatsPromotion.length; i++) {
  candidatsPromotion[i]!.statut = i % 2 === 0 ? 'active' : 'reactive';
  opportunitesT4++;
}

// --- Écriture en base -------------------------------------------------------

function main(): void {
  const RESET = process.argv.includes('--reset');
  const db = getDb();
  const { n } = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM leads').get()!;

  if (RESET) {
    db.exec('DELETE FROM leads');
  } else if (n > 0) {
    console.error(
      `La base contient déjà ${n} lead(s). Relancez avec --reset pour la réinitialiser avant de regénérer le jeu de démonstration.`,
    );
    process.exit(1);
  }

  let crees = 0;
  for (const lead of leadsGeneres) {
    const parsed = schemaLeadInput.parse(lead);
    creerLead(parsed, { dedupliquer: false });
    crees++;
  }

  ecrireObjectif({ periode: '2026-Q4', ...OBJECTIF_DEFAUT });

  const leadsT4 = listerTousLeads({ periode: '2026-Q4' });
  const pointsT4 = leadsT4.reduce((s, l) => s + pointsDuLead(l), 0);
  const oppsT4 = leadsT4.filter(estOpportuniteInbound).length;

  console.log('--- Récapitulatif du jeu de démonstration ---');
  console.log(`Leads créés        : ${crees}`);
  console.log(`Points totaux T4   : ${pointsT4}`);
  console.log(`Opportunités T4    : ${oppsT4}`);
  console.log('Objectif 2026-Q4 écrit (valeurs par défaut).');
}

main();
