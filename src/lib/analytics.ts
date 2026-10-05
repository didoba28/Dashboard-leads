/**
 * Agrégations du dashboard.
 *
 * Tout est calculé en mémoire à partir des leads de la période : le volume est
 * faible et cela garantit que les chiffres affichés sortent exactement du même
 * code que le moteur de scoring (pas de logique métier dupliquée en SQL).
 */
import { estOpportuniteInbound, pointsDuLead, type Lead } from './domain/lead';
import {
  avancementPeriode,
  construirePeriode,
  joursRestants,
  type Periode,
} from './domain/periods';
import {
  rythmeRequis,
  synthetiserObjectif,
  type Objectif,
  type SyntheseObjectif,
} from './domain/objectives';
import {
  INITIATIVES_OUTBOUND,
  LABELS_INITIATIVE,
  LABELS_SEGMENT,
  LABELS_SOURCE_COLLECTE,
  LABELS_STATUT,
  LABELS_TYPE_DEMANDE,
  type Initiative,
  type Segment,
  type SourceCollecte,
  type Statut,
  type TypeDemande,
} from './domain/taxonomy';

export interface PartRepartition {
  cle: string;
  label: string;
  leads: number;
  points: number;
}

export interface PointSerie {
  /** Début de semaine ISO (`YYYY-MM-DD`). */
  semaine: string;
  label: string;
  leads: number;
  points: number;
  pointsCumules: number;
  opportunites: number;
  /** Décomposition des points par famille d'initiative (barres empilées). */
  pointsSite: number;
  pointsNewsletter: number;
  pointsOutbound: number;
  /** Trajectoire linéaire idéale pour tenir l'objectif. */
  cible: number;
}

export interface Kpis {
  leadsTotal: number;
  leadsEligibles: number;
  leadsExclus: number;
  leadsEnAttente: number;
  points: number;
  pointsInbound: number;
  pointsOutbound: number;
  opportunites: number;
  activations: number;
  reactivations: number;
  tauxActivation: number;
  leadsAVerifier: number;
  leadsSansProprietaire: number;
}

export interface Comparaison {
  points: number;
  leads: number;
  opportunites: number;
  deltaPoints: number | null;
  deltaLeads: number | null;
  deltaOpportunites: number | null;
}

export interface Stats {
  periode: Periode;
  objectif: Objectif;
  synthese: SyntheseObjectif;
  kpis: Kpis;
  serie: PointSerie[];
  parSegment: PartRepartition[];
  parInitiative: PartRepartition[];
  parTypeDemande: PartRepartition[];
  parSourceCollecte: PartRepartition[];
  parStatut: PartRepartition[];
  topCampagnes: PartRepartition[];
  topLeadMagnets: PartRepartition[];
  comparaison: Comparaison;
  joursRestants: number;
  avancement: number;
  rythmePointsParSemaine: number;
  rythmeOpportunitesParSemaine: number;
}

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lundi de la semaine contenant `date`, au format `YYYY-MM-DD`. */
export function debutSemaine(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const jour = (d.getUTCDay() + 6) % 7; // 0 = lundi
  d.setUTCDate(d.getUTCDate() - jour);
  return d.toISOString().slice(0, 10);
}

function libelleSemaine(debut: string): string {
  const d = new Date(`${debut}T00:00:00Z`);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function regrouper<T extends string>(
  leads: Lead[],
  cle: (lead: Lead) => T | null,
  labels: Record<string, string>,
  options: { toutesLesCles?: readonly T[]; limite?: number } = {},
): PartRepartition[] {
  const map = new Map<string, { leads: number; points: number }>();
  for (const valeur of options.toutesLesCles ?? []) {
    map.set(valeur, { leads: 0, points: 0 });
  }
  for (const lead of leads) {
    const k = cle(lead);
    if (k == null) continue;
    const entree = map.get(k) ?? { leads: 0, points: 0 };
    entree.leads += 1;
    entree.points += pointsDuLead(lead);
    map.set(k, entree);
  }
  const out = [...map.entries()].map(([k, v]) => ({
    cle: k,
    label: labels[k] ?? k,
    leads: v.leads,
    points: arrondi(v.points),
  }));
  out.sort((a, b) => b.points - a.points || b.leads - a.leads || a.label.localeCompare(b.label));
  return options.limite ? out.slice(0, options.limite) : out;
}

export function calculerKpis(leads: Lead[]): Kpis {
  const kpis: Kpis = {
    leadsTotal: leads.length,
    leadsEligibles: 0,
    leadsExclus: 0,
    leadsEnAttente: 0,
    points: 0,
    pointsInbound: 0,
    pointsOutbound: 0,
    opportunites: 0,
    activations: 0,
    reactivations: 0,
    tauxActivation: 0,
    leadsAVerifier: 0,
    leadsSansProprietaire: 0,
  };

  for (const lead of leads) {
    const points = pointsDuLead(lead);
    kpis.points += points;
    if (!lead.pointsConfirmes) kpis.leadsEnAttente += 1;
    else if (points > 0) kpis.leadsEligibles += 1;
    else kpis.leadsExclus += 1;
    if (INITIATIVES_OUTBOUND.includes(lead.initiative)) kpis.pointsOutbound += points;
    else kpis.pointsInbound += points;
    if (estOpportuniteInbound(lead)) {
      kpis.opportunites += 1;
      if (lead.statut === 'reactive' || lead.typeActivation === 'reactivation') kpis.reactivations += 1;
      else kpis.activations += 1;
    }
    if (lead.aVerifier) kpis.leadsAVerifier += 1;
    if (!lead.proprietaire) kpis.leadsSansProprietaire += 1;
  }

  kpis.points = arrondi(kpis.points);
  kpis.pointsInbound = arrondi(kpis.pointsInbound);
  kpis.pointsOutbound = arrondi(kpis.pointsOutbound);
  kpis.tauxActivation =
    kpis.leadsEligibles > 0 ? arrondi((kpis.opportunites / kpis.leadsEligibles) * 100) : 0;
  return kpis;
}

function construireSerie(leads: Lead[], periode: Periode, ciblePoints: number): PointSerie[] {
  const semaines: string[] = [];
  const curseur = new Date(`${debutSemaine(periode.debut)}T00:00:00Z`);
  const fin = new Date(`${periode.fin}T00:00:00Z`);
  while (curseur <= fin) {
    semaines.push(curseur.toISOString().slice(0, 10));
    curseur.setUTCDate(curseur.getUTCDate() + 7);
  }

  interface Cumul {
    leads: number;
    points: number;
    opportunites: number;
    site: number;
    newsletter: number;
    outbound: number;
  }
  const vide = (): Cumul => ({ leads: 0, points: 0, opportunites: 0, site: 0, newsletter: 0, outbound: 0 });
  const parSemaine = new Map<string, Cumul>();
  for (const semaine of semaines) parSemaine.set(semaine, vide());
  for (const lead of leads) {
    const semaine = debutSemaine(lead.dateReception);
    const entree = parSemaine.get(semaine);
    if (!entree) continue;
    const points = pointsDuLead(lead);
    entree.leads += 1;
    entree.points += points;
    if (INITIATIVES_OUTBOUND.includes(lead.initiative)) entree.outbound += points;
    else if (lead.initiative === 'newsletter') entree.newsletter += points;
    else entree.site += points;
    if (estOpportuniteInbound(lead)) entree.opportunites += 1;
  }

  let cumul = 0;
  return semaines.map((semaine, i) => {
    const e = parSemaine.get(semaine)!;
    cumul += e.points;
    return {
      semaine,
      label: libelleSemaine(semaine),
      leads: e.leads,
      points: arrondi(e.points),
      pointsCumules: arrondi(cumul),
      opportunites: e.opportunites,
      pointsSite: arrondi(e.site),
      pointsNewsletter: arrondi(e.newsletter),
      pointsOutbound: arrondi(e.outbound),
      cible: arrondi((ciblePoints * (i + 1)) / semaines.length),
    };
  });
}

function comparer(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel === 0 ? 0 : null;
  return arrondi(((actuel - precedent) / precedent) * 100);
}

export function construireStats(params: {
  leads: Lead[];
  leadsPeriodePrecedente: Lead[];
  objectif: Objectif;
  maintenant?: Date;
}): Stats {
  const { leads, leadsPeriodePrecedente, objectif } = params;
  const maintenant = params.maintenant ?? new Date();
  const periode = construirePeriode(objectif.periode);
  const kpis = calculerKpis(leads);
  const kpisPrecedents = calculerKpis(leadsPeriodePrecedente);
  const avancement = avancementPeriode(periode.id, maintenant);
  const restants = joursRestants(periode.id, maintenant);

  return {
    periode,
    objectif,
    synthese: synthetiserObjectif({
      objectif,
      points: kpis.points,
      opportunites: kpis.opportunites,
      avancement,
    }),
    kpis,
    serie: construireSerie(leads, periode, objectif.ciblePoints),
    parSegment: regrouper<Segment>(leads, (l) => l.segment, LABELS_SEGMENT, {
      toutesLesCles: ['b2b', 'collectivite', 'b2c'],
    }),
    parInitiative: regrouper<Initiative>(leads, (l) => l.initiative, LABELS_INITIATIVE),
    parTypeDemande: regrouper<TypeDemande>(leads, (l) => l.typeDemande, LABELS_TYPE_DEMANDE),
    parSourceCollecte: regrouper<SourceCollecte>(
      leads,
      (l) => l.sourceCollecte,
      LABELS_SOURCE_COLLECTE,
    ),
    parStatut: regrouper<Statut>(leads, (l) => l.statut, LABELS_STATUT),
    topCampagnes: regrouper(leads, (l) => l.campagne, {}, { limite: 6 }),
    topLeadMagnets: regrouper(leads, (l) => l.leadMagnet, {}, { limite: 6 }),
    comparaison: {
      points: kpisPrecedents.points,
      leads: kpisPrecedents.leadsTotal,
      opportunites: kpisPrecedents.opportunites,
      deltaPoints: comparer(kpis.points, kpisPrecedents.points),
      deltaLeads: comparer(kpis.leadsTotal, kpisPrecedents.leadsTotal),
      deltaOpportunites: comparer(kpis.opportunites, kpisPrecedents.opportunites),
    },
    joursRestants: restants,
    avancement,
    rythmePointsParSemaine: rythmeRequis({
      cible: objectif.ciblePoints,
      realise: kpis.points,
      joursRestants: restants,
    }),
    rythmeOpportunitesParSemaine: rythmeRequis({
      cible: objectif.cibleActivation,
      realise: kpis.opportunites,
      joursRestants: restants,
    }),
  };
}

/** Période précédant `periode` (`2026-Q4` → `2026-Q3`). */
export function periodePrecedente(periode: string): string {
  const p = construirePeriode(periode);
  return p.trimestre === 1 ? `${p.annee - 1}-Q4` : `${p.annee}-Q${p.trimestre - 1}`;
}
