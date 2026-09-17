/**
 * Tâches planifiées.
 *
 * Une seule route, une tâche par segment d'URL : `/api/cron/<tache>`.
 * Vercel Cron appelle ces URL en GET avec l'en-tête
 * `Authorization: Bearer $CRON_SECRET` ; POST est accepté pour les autres
 * ordonnanceurs (cron-job.org, GitHub Actions, un `curl` dans une crontab).
 *
 * Sans `CRON_SECRET`, la route est fermée : une tâche déclenchable par
 * n'importe qui est une porte ouverte, pas une commodité.
 */
import { NextResponse } from 'next/server';
import { synchroniser } from '@/lib/notion/sync';
import { listerTousLeads } from '@/lib/db/leads';
import { lireObjectif, lireReglages } from '@/lib/db/settings';
import { calculerKpis } from '@/lib/analytics';
import { avancementPeriode, joursRestants, periodeDepuisDate } from '@/lib/domain/periods';
import { synthetiserObjectif } from '@/lib/domain/objectives';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Tache = () => Promise<Record<string, unknown>>;

/**
 * Synchronise Notion dans les deux sens. C'est la tâche qui rend
 * l'intégration réellement automatique : sans elle, il faut cliquer.
 */
const synchroniserNotion: Tache = async () => {
  const resultat = await synchroniser();
  return {
    succes: resultat.succes,
    crees: resultat.crees,
    maj: resultat.maj,
    ignores: resultat.ignores,
    erreurs: resultat.erreurs,
    dureeMs: resultat.dureeMs,
  };
};

/**
 * Photographie de la période en cours, renvoyée en JSON.
 *
 * Elle ne notifie encore personne : un ordonnanceur ou un scénario Make peut
 * l'appeler et se charger de l'envoi (Slack, e-mail). Le jour où l'on ajoute
 * un envoi Slack natif, c'est ici qu'il se branchera.
 */
const resumePeriode: Tache = async () => {
  const reglages = await lireReglages();
  const periode = reglages.periodeActive;
  const [leads, objectif] = await Promise.all([
    listerTousLeads({ periode }),
    lireObjectif(periode),
  ]);
  const kpis = calculerKpis(leads);
  const synthese = synthetiserObjectif({
    objectif,
    points: kpis.points,
    opportunites: kpis.opportunites,
    avancement: avancementPeriode(periode),
  });
  return {
    periode,
    joursRestants: joursRestants(periode),
    points: kpis.points,
    ciblePoints: objectif.ciblePoints,
    opportunites: kpis.opportunites,
    cibleActivation: objectif.cibleActivation,
    leadsAVerifier: kpis.leadsAVerifier,
    primeProjetee: synthese.primeTotale,
    projectionPoints: synthese.projectionPoints,
    periodeCourante: periodeDepuisDate(new Date()),
  };
};

const TACHES: Record<string, Tache> = {
  'notion-sync': synchroniserNotion,
  'resume-periode': resumePeriode,
};

type Contexte = { params: Promise<{ tache: string }> };

async function executer(request: Request, { params }: Contexte) {
  const attendu = process.env['CRON_SECRET'];
  if (!attendu) {
    return NextResponse.json(
      { erreur: "CRON_SECRET n'est pas configuré : les tâches planifiées sont désactivées." },
      { status: 409 },
    );
  }

  const entete = request.headers.get('authorization') ?? '';
  const fourni = entete.startsWith('Bearer ')
    ? entete.slice(7)
    : new URL(request.url).searchParams.get('secret');
  if (!fourni || !comparaisonConstante(fourni, attendu)) {
    return NextResponse.json({ erreur: 'Secret de tâche planifiée invalide.' }, { status: 401 });
  }

  const { tache } = await params;
  const executee = TACHES[tache];
  if (!executee) {
    return NextResponse.json(
      { erreur: `Tâche inconnue : ${tache}`, disponibles: Object.keys(TACHES) },
      { status: 404 },
    );
  }

  const debut = Date.now();
  try {
    const resultat = await executee();
    return NextResponse.json({ tache, dureeMs: Date.now() - debut, ...resultat });
  } catch (err) {
    console.error(`[cron ${tache}]`, err);
    return NextResponse.json(
      {
        tache,
        succes: false,
        erreur: err instanceof Error ? err.message : String(err),
        dureeMs: Date.now() - debut,
      },
      { status: 500 },
    );
  }
}

export const GET = executer;
export const POST = executer;

function comparaisonConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
