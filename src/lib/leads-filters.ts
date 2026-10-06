/** Filtres du registre, partagés par le premier rendu et les liens de navigation. */
import type { FiltresLeads } from '@/lib/db/leads';
import { estIdPeriodeValide } from '@/lib/domain/periods';
import { INITIATIVES, RELATIONS, SEGMENTS, SOURCES_COLLECTE, STATUTS, TYPES_DEMANDE } from '@/lib/domain/taxonomy';

export const TAILLE_PAGE_LEADS = 50;
export const TRIS_LEADS = ['date_desc', 'date_asc', 'points_desc', 'maj_desc'] as const;
type BooleenFiltre = '' | 'true' | 'false';

export interface FiltresVue {
  periode: string;
  periodeActivation: string;
  dateDebut: string;
  dateFin: string;
  q: string;
  segment: string;
  relation: string;
  statut: string;
  typeDemande: string;
  initiative: string;
  sourceCollecte: string;
  proprietaire: string;
  eligible: BooleenFiltre;
  aVerifier: BooleenFiltre;
  aConfirmer: boolean;
  valides: boolean;
  pointsExclus: boolean;
  opportunitesInbound: boolean;
  tri: (typeof TRIS_LEADS)[number];
}

export function filtresVides(): FiltresVue {
  return { periode: 'toutes', periodeActivation: '', dateDebut: '', dateFin: '', q: '', segment: '', relation: '', statut: '', typeDemande: '', initiative: '', sourceCollecte: '', proprietaire: '', eligible: '', aVerifier: '', aConfirmer: false, valides: false, pointsExclus: false, opportunitesInbound: false, tri: 'date_desc' };
}

function dateValide(valeur: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return '';
  const date = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === valeur ? valeur : '';
}

function booleen(valeur: string | null): BooleenFiltre {
  return valeur === 'true' || valeur === '1' ? 'true' : valeur === 'false' || valeur === '0' ? 'false' : '';
}

function enumeration(params: URLSearchParams, cle: string, valeurs: readonly string[]): string {
  return [...new Set(params.getAll(cle).flatMap((v) => v.split(',')).map((v) => v.trim()).filter((v) => valeurs.includes(v)))].join(',');
}

export function lireFiltresVue(params: URLSearchParams | Record<string, string | string[] | undefined>): { filtres: FiltresVue; offset: number; leadId: string | null } {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams();
  if (!(params instanceof URLSearchParams)) {
    for (const [cle, valeur] of Object.entries(params)) {
      for (const item of Array.isArray(valeur) ? valeur : valeur === undefined ? [] : [valeur]) p.append(cle, item);
    }
  }
  const f = filtresVides();
  f.dateDebut = dateValide(p.get('dateDebut') ?? '');
  f.dateFin = dateValide(p.get('dateFin') ?? '');
  if (f.dateDebut && f.dateFin && f.dateDebut > f.dateFin) [f.dateDebut, f.dateFin] = [f.dateFin, f.dateDebut];
  const periode = p.get('periode');
  f.periode = !f.dateDebut && !f.dateFin && periode && estIdPeriodeValide(periode) ? periode : 'toutes';
  const periodeActivation = p.get('periodeActivation');
  f.periodeActivation = periodeActivation && estIdPeriodeValide(periodeActivation) ? periodeActivation : '';
  f.q = (p.get('q') ?? '').trim().slice(0, 500);
  f.proprietaire = (p.get('proprietaire') ?? '').trim().slice(0, 500);
  f.segment = enumeration(p, 'segment', SEGMENTS);
  f.relation = enumeration(p, 'relation', RELATIONS);
  f.statut = enumeration(p, 'statut', STATUTS);
  f.typeDemande = enumeration(p, 'typeDemande', TYPES_DEMANDE);
  f.initiative = enumeration(p, 'initiative', INITIATIVES);
  f.sourceCollecte = enumeration(p, 'sourceCollecte', SOURCES_COLLECTE);
  f.eligible = booleen(p.get('eligible'));
  f.aVerifier = booleen(p.get('aVerifier'));
  const points = booleen(p.get('pointsConfirmes'));
  f.valides = points === 'true' || (!points && booleen(p.get('valides')) === 'true');
  f.aConfirmer = !f.valides && (points === 'false' || booleen(p.get('aConfirmer')) === 'true');
  f.pointsExclus = booleen(p.get('pointsExclus')) === 'true';
  if (f.pointsExclus) { f.valides = true; f.aConfirmer = false; }
  f.opportunitesInbound = booleen(p.get('opportunitesInbound')) === 'true';
  const tri = p.get('tri');
  if (TRIS_LEADS.includes(tri as FiltresVue['tri'])) f.tri = tri as FiltresVue['tri'];
  const brutOffset = Number(p.get('offset') ?? 0);
  const offset = Number.isFinite(brutOffset) && brutOffset >= 0 ? Math.min(1_000_000, Math.floor(brutOffset / TAILLE_PAGE_LEADS) * TAILLE_PAGE_LEADS) : 0;
  const leadId = p.get('leadId');
  return { filtres: f, offset, leadId: leadId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId) ? leadId : null };
}

export function construireQueryLeads(f: FiltresVue, offset = 0, options: { pagination?: boolean; leadId?: string | null } = {}): string {
  const p = new URLSearchParams();
  if (f.periode !== 'toutes') p.set('periode', f.periode);
  if (f.periodeActivation) p.set('periodeActivation', f.periodeActivation);
  for (const cle of ['dateDebut', 'dateFin', 'q', 'segment', 'relation', 'statut', 'typeDemande', 'initiative', 'sourceCollecte', 'proprietaire', 'eligible', 'aVerifier'] as const) {
    if (f[cle]) p.set(cle, f[cle].trim());
  }
  if (f.valides) p.set('pointsConfirmes', 'true');
  else if (f.aConfirmer) p.set('pointsConfirmes', 'false');
  if (f.pointsExclus) p.set('pointsExclus', 'true');
  if (f.opportunitesInbound) p.set('opportunitesInbound', 'true');
  p.set('tri', f.tri);
  if (options.pagination !== false) { p.set('limite', String(TAILLE_PAGE_LEADS)); p.set('offset', String(offset)); }
  if (options.leadId) p.set('leadId', options.leadId);
  return p.toString();
}

export function filtresPourDepot(f: FiltresVue, offset = 0): FiltresLeads {
  const liste = <T extends string>(valeur: string): T[] | undefined => valeur ? valeur.split(',') as T[] : undefined;
  return {
    periode: f.periode === 'toutes' ? undefined : f.periode,
    periodeActivation: f.periodeActivation || undefined,
    dateDebut: f.dateDebut || undefined, dateFin: f.dateFin || undefined,
    q: f.q || undefined, proprietaire: f.proprietaire || undefined,
    segment: liste(f.segment), relation: liste(f.relation), statut: liste(f.statut), typeDemande: liste(f.typeDemande), initiative: liste(f.initiative), sourceCollecte: liste(f.sourceCollecte),
    eligible: f.eligible ? f.eligible === 'true' : undefined,
    aVerifier: f.aVerifier ? f.aVerifier === 'true' : undefined,
    pointsConfirmes: f.valides ? true : f.aConfirmer ? false : undefined,
    pointsExclus: f.pointsExclus || undefined,
    opportunitesInbound: f.opportunitesInbound || undefined,
    tri: f.tri, limite: TAILLE_PAGE_LEADS, offset,
  };
}
