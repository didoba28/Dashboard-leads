/** Synthèse de pilotage de la cohorte reçue sur une période, sans rescoring. */
import { estEmailTechnique, pointsDuLead, pointsProposesDuLead, type Lead } from './lead';
import { construirePeriode } from './periods';
import { INITIATIVES_OUTBOUND, TYPES_LEAD_MAGNET } from './taxonomy';

export interface LigneMensuelle {
  mois: string;
  debut: string;
  fin: string;
  recus: number;
  comptabilises: number;
  enAttente: number;
  exclus: number;
  pointsValides: number;
  pointsProposes: number;
}

export interface QualiteDonnees {
  total: number;
  identites: number;
  contacts: number;
  origines: number;
  responsables: number;
  dossiersComplets: number;
  completude: number | null;
}

export interface ActionLead {
  lead: Lead;
  priorite: 'haute' | 'normale';
  raisons: string[];
  ageJours: number;
}

export interface Pilotage {
  recus: number;
  comptabilises: number;
  enAttente: number;
  exclus: number;
  pointsValides: number;
  pointsProposes: number;
  aVerifier: number;
  nonAttribues: number;
  aQualifier: number;
  enAttenteDepuis7Jours: number;
  qualite: QualiteDonnees;
  mois: LigneMensuelle[];
  actions: ActionLead[];
  totalActions: number;
  derniersLeads: Lead[];
}

const renseigne = (valeur: string | null | undefined) => Boolean(valeur?.trim());
const arrondi = (valeur: number) => Math.round(valeur * 100) / 100;

/** Un contact technique dans une notification ne désigne pas le prospect. */
export function aContactExploitable(lead: Lead): boolean {
  const emailTechnique = estEmailTechnique(lead.email);
  return (renseigne(lead.email) && !emailTechnique) ||
    (renseigne(lead.telephone) && !emailTechnique);
}

export function aOrigineDetaillee(lead: Lead): boolean {
  if (lead.initiative === 'inconnue') return false;
  if (TYPES_LEAD_MAGNET.includes(lead.typeDemande) && !renseigne(lead.leadMagnet)) return false;
  if (INITIATIVES_OUTBOUND.includes(lead.initiative) && !renseigne(lead.campagne)) return false;
  return true;
}

function estOuvert(lead: Lead): boolean {
  return lead.statut === 'nouveau' || lead.statut === 'a_qualifier' || lead.statut === 'qualifie';
}

/** Les files se recoupent : un dossier n'apparaît qu'une fois dans les priorités. */
export function construirePilotage(params: {
  leads: readonly Lead[];
  periode: string;
  aujourdhui?: string;
}): Pilotage {
  const periode = construirePeriode(params.periode);
  const dateParis = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const aujourdhui = params.aujourdhui ?? ['year', 'month', 'day'].map((type) => dateParis.find((part) => part.type === type)!.value).join('-');
  // Une protection explicite empêche une agrégation hors périmètre si l'appelant
  // lui fournit un jour la collection complète plutôt que la cohorte filtrée.
  const leads = params.leads.filter((lead) => lead.dateReception >= periode.debut && lead.dateReception <= periode.fin);
  const mois: LigneMensuelle[] = [];
  for (let index = 0; index < 3; index += 1) {
    const date = new Date(`${periode.debut}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + index);
    const debut = date.toISOString().slice(0, 10);
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
    mois.push({
      mois: debut.slice(0, 7), debut, fin: date.toISOString().slice(0, 10),
      recus: 0, comptabilises: 0, enAttente: 0, exclus: 0, pointsValides: 0, pointsProposes: 0,
    });
  }
  const parMois = new Map(mois.map((ligne) => [ligne.mois, ligne]));
  const qualite: QualiteDonnees = {
    total: leads.length, identites: 0, contacts: 0, origines: 0, responsables: 0,
    dossiersComplets: 0, completude: null,
  };
  const resultat: Pilotage = {
    recus: leads.length, comptabilises: 0, enAttente: 0, exclus: 0,
    pointsValides: 0, pointsProposes: 0, aVerifier: 0, nonAttribues: 0,
    aQualifier: 0, enAttenteDepuis7Jours: 0, qualite, mois, actions: [], totalActions: 0,
    derniersLeads: [],
  };
  const temps = Date.parse(`${aujourdhui}T00:00:00Z`);

  for (const lead of leads) {
    const ligne = parMois.get(lead.dateReception.slice(0, 7))!;
    const points = pointsDuLead(lead);
    const proposes = pointsProposesDuLead(lead);
    const ageJours = Math.max(0, Math.floor((temps - Date.parse(`${lead.dateReception}T00:00:00Z`)) / 86_400_000));
    resultat.pointsValides += points;
    ligne.pointsValides += points;
    ligne.recus += 1;
    if (!lead.pointsConfirmes) {
      resultat.enAttente += 1;
      resultat.pointsProposes += proposes;
      ligne.enAttente += 1;
      ligne.pointsProposes += proposes;
      if (ageJours >= 7) resultat.enAttenteDepuis7Jours += 1;
    } else if (points > 0) {
      resultat.comptabilises += 1;
      ligne.comptabilises += 1;
    } else {
      resultat.exclus += 1;
      ligne.exclus += 1;
    }

    const identite = renseigne(lead.nom) || renseigne(lead.societe);
    const contact = aContactExploitable(lead);
    const origine = aOrigineDetaillee(lead);
    const responsable = renseigne(lead.proprietaire);
    if (identite) qualite.identites += 1;
    if (contact) qualite.contacts += 1;
    if (origine) qualite.origines += 1;
    if (responsable) qualite.responsables += 1;
    if (identite && contact && origine && responsable) qualite.dossiersComplets += 1;

    const raisons: string[] = [];
    const activationSansDate = points > 0 && lead.eligible && lead.eligibleActivation &&
      (lead.statut === 'active' || lead.statut === 'reactive') && !lead.dateActivation;
    if (activationSansDate) raisons.push('Renseigner la date d’activation pour son rattachement à la période');
    if (lead.aVerifier) {
      resultat.aVerifier += 1;
      raisons.push('Vérifier la qualification et la règle appliquée');
    }
    if (!lead.pointsConfirmes) raisons.push('Confirmer la décision de comptage');
    const suiviNecessaire = estOuvert(lead) && (lead.eligible || proposes > 0);
    if (suiviNecessaire && !identite) raisons.push('Compléter le nom du contact ou de l’organisme');
    if (suiviNecessaire && !contact) raisons.push('Compléter un moyen de contact externe');
    if (suiviNecessaire && !origine) raisons.push('Préciser l’origine, la ressource ou la campagne');
    if (suiviNecessaire && !responsable) {
      resultat.nonAttribues += 1;
      raisons.push('Attribuer le dossier à un responsable');
    }
    if (suiviNecessaire && (lead.statut === 'nouveau' || lead.statut === 'a_qualifier')) {
      resultat.aQualifier += 1;
      raisons.push(ageJours >= 7
        ? 'Faire avancer la qualification : reçu depuis au moins 7 jours'
        : 'Qualifier la demande commerciale');
    }
    if (raisons.length > 0) {
      resultat.actions.push({ lead, raisons, ageJours, priorite: lead.aVerifier || activationSansDate || (!lead.pointsConfirmes && ageJours >= 7) ? 'haute' : 'normale' });
    }
  }

  if (qualite.total > 0) {
    qualite.completude = Math.round(((qualite.identites + qualite.contacts + qualite.origines + qualite.responsables) / (qualite.total * 4)) * 100);
  }
  resultat.actions.sort((a, b) =>
    Number(b.priorite === 'haute') - Number(a.priorite === 'haute') ||
    Number(b.lead.aVerifier) - Number(a.lead.aVerifier) ||
    b.ageJours - a.ageJours || b.raisons.length - a.raisons.length || a.lead.id.localeCompare(b.lead.id),
  );
  resultat.totalActions = resultat.actions.length;
  resultat.actions = resultat.actions.slice(0, 6);
  resultat.derniersLeads = [...leads].sort((a, b) =>
    b.dateReception.localeCompare(a.dateReception) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  ).slice(0, 5);
  resultat.pointsValides = arrondi(resultat.pointsValides);
  resultat.pointsProposes = arrondi(resultat.pointsProposes);
  for (const ligne of mois) {
    ligne.pointsValides = arrondi(ligne.pointsValides);
    ligne.pointsProposes = arrondi(ligne.pointsProposes);
  }
  return resultat;
}

/** Les liens conservent toujours la cohorte, même depuis une fiche précise. */
export function lienLeads(periode: string, filtres: Record<string, string | number | boolean> = {}): string {
  const recherche = new URLSearchParams({ periode });
  for (const [cle, valeur] of Object.entries(filtres)) recherche.set(cle, String(valeur));
  return `/leads?${recherche.toString()}`;
}
