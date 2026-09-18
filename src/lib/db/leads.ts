/** Dépôt de données des leads : lecture, écriture, filtres et déduplication. */
import { getDb, maintenantIso, nouvelId } from './index';
import {
  calculerDedupeKey,
  type Lead,
  type LeadParsed,
  aujourdHui,
} from '@/lib/domain/lead';
import { scorerLead } from '@/lib/domain/scoring';
import { construirePeriode } from '@/lib/domain/periods';
import { lireReglages } from './settings';
import type {
  Initiative,
  Relation,
  Segment,
  SourceCollecte,
  Statut,
  TypeActivation,
  TypeDemande,
} from '@/lib/domain/taxonomy';

interface LigneLead {
  id: string;
  date_reception: string;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  societe: string | null;
  fonction: string | null;
  ville: string | null;
  segment: string;
  relation: string;
  type_demande: string;
  initiative: string;
  source_collecte: string;
  campagne: string | null;
  lead_magnet: string | null;
  message: string | null;
  statut: string;
  type_activation: string | null;
  date_activation: string | null;
  proprietaire: string | null;
  tags: string;
  // SQLite renvoie 0/1, PostgreSQL renvoie un booléen natif : `Boolean(...)` absorbe les deux.
  eligible: number | boolean;
  points: number;
  eligible_activation: number | boolean;
  regle_id: string;
  regle_label: string;
  explication: string;
  points_override: number | null;
  points_override_raison: string | null;
  validation_requise: number | boolean;
  points_confirmes: number | boolean;
  points_confirmes_le: string | null;
  points_confirmes_par: string | null;
  a_verifier: number | boolean;
  confiance: number | null;
  dedupe_key: string | null;
  notion_page_id: string | null;
  notion_last_synced_at: string | null;
  raw_payload: string | null;
  created_at: string;
  updated_at: string;
}

function versLead(l: LigneLead): Lead {
  return {
    id: l.id,
    dateReception: l.date_reception,
    nom: l.nom,
    email: l.email,
    telephone: l.telephone,
    societe: l.societe,
    fonction: l.fonction,
    ville: l.ville,
    segment: l.segment as Segment,
    relation: l.relation as Relation,
    typeDemande: l.type_demande as TypeDemande,
    initiative: l.initiative as Initiative,
    sourceCollecte: l.source_collecte as SourceCollecte,
    campagne: l.campagne,
    leadMagnet: l.lead_magnet,
    message: l.message,
    statut: l.statut as Statut,
    typeActivation: l.type_activation as TypeActivation | null,
    dateActivation: l.date_activation,
    proprietaire: l.proprietaire,
    tags: parseJson<string[]>(l.tags, []),
    eligible: Boolean(l.eligible),
    points: l.points,
    eligibleActivation: Boolean(l.eligible_activation),
    regleId: l.regle_id,
    regleLabel: l.regle_label,
    explication: l.explication,
    pointsOverride: l.points_override,
    pointsOverrideRaison: l.points_override_raison,
    validationRequise: Boolean(l.validation_requise),
    pointsConfirmes: Boolean(l.points_confirmes),
    pointsConfirmesLe: l.points_confirmes_le,
    pointsConfirmesPar: l.points_confirmes_par,
    aVerifier: Boolean(l.a_verifier),
    confiance: l.confiance,
    dedupeKey: l.dedupe_key,
    notionPageId: l.notion_page_id,
    notionLastSyncedAt: l.notion_last_synced_at,
    rawPayload: l.raw_payload ? parseJson<unknown>(l.raw_payload, null) : null,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
  };
}

function parseJson<T>(brut: string, defaut: T): T {
  try {
    return JSON.parse(brut) as T;
  } catch {
    return defaut;
  }
}

const COLONNES = `id, date_reception, nom, email, telephone, societe, fonction, ville, segment,
  relation, type_demande, initiative, source_collecte, campagne, lead_magnet, message, statut,
  type_activation, date_activation, proprietaire, tags, eligible, points, eligible_activation,
  regle_id, regle_label, explication, points_override, points_override_raison,
  validation_requise, points_confirmes, points_confirmes_le, points_confirmes_par, a_verifier,
  confiance, dedupe_key, notion_page_id, notion_last_synced_at, raw_payload, created_at, updated_at`;

export interface FiltresLeads {
  periode?: string;
  dateDebut?: string;
  dateFin?: string;
  segment?: Segment[];
  relation?: Relation[];
  typeDemande?: TypeDemande[];
  initiative?: Initiative[];
  sourceCollecte?: SourceCollecte[];
  statut?: Statut[];
  eligible?: boolean;
  aVerifier?: boolean;
  pointsConfirmes?: boolean;
  proprietaire?: string;
  /** Recherche plein texte simple sur nom, e-mail, société, message. */
  q?: string;
  tri?: 'date_desc' | 'date_asc' | 'points_desc' | 'maj_desc';
  limite?: number;
  offset?: number;
}

interface ClauseWhere {
  sql: string;
  params: unknown[];
}

function construireWhere(f: FiltresLeads): ClauseWhere {
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];

  let debut = f.dateDebut;
  let fin = f.dateFin;
  if (f.periode) {
    const p = construirePeriode(f.periode);
    debut = debut ?? p.debut;
    fin = fin ?? p.fin;
  }
  if (debut) {
    conditions.push('date_reception >= ?');
    params.push(debut);
  }
  if (fin) {
    conditions.push('date_reception <= ?');
    params.push(fin);
  }

  const listes: Array<[string, string[] | undefined]> = [
    ['segment', f.segment],
    ['relation', f.relation],
    ['type_demande', f.typeDemande],
    ['initiative', f.initiative],
    ['source_collecte', f.sourceCollecte],
    ['statut', f.statut],
  ];
  for (const [colonne, valeurs] of listes) {
    if (valeurs && valeurs.length > 0) {
      conditions.push(`${colonne} IN (${valeurs.map(() => '?').join(', ')})`);
      params.push(...valeurs);
    }
  }

  if (f.eligible !== undefined) {
    conditions.push('eligible = ?');
    params.push(f.eligible ? 1 : 0);
  }
  if (f.aVerifier !== undefined) {
    conditions.push('a_verifier = ?');
    params.push(f.aVerifier ? 1 : 0);
  }
  if (f.pointsConfirmes !== undefined) {
    conditions.push('points_confirmes = ?');
    params.push(f.pointsConfirmes ? 1 : 0);
  }
  if (f.proprietaire) {
    conditions.push('proprietaire = ?');
    params.push(f.proprietaire);
  }
  if (f.q && f.q.trim() !== '') {
    // `lower(...) LIKE ?` (motif déjà en minuscules) est valide sur SQLite comme
    // PostgreSQL : pas besoin de distinguer `LIKE` (SQLite) et `ILIKE` (PostgreSQL).
    const motif = `%${f.q.trim().toLowerCase()}%`;
    conditions.push(
      '(lower(coalesce(nom, %s)) LIKE ? OR lower(coalesce(email, %s)) LIKE ? OR lower(coalesce(societe, %s)) LIKE ? OR lower(coalesce(message, %s)) LIKE ? OR lower(coalesce(lead_magnet, %s)) LIKE ?)'.replaceAll(
        '%s',
        "''",
      ),
    );
    params.push(motif, motif, motif, motif, motif);
  }

  return { sql: conditions.join(' AND '), params };
}

const TRIS: Record<NonNullable<FiltresLeads['tri']>, string> = {
  date_desc: 'date_reception DESC, created_at DESC',
  date_asc: 'date_reception ASC, created_at ASC',
  points_desc: 'points DESC, date_reception DESC',
  maj_desc: 'updated_at DESC',
};

export async function listerLeads(
  filtres: FiltresLeads = {},
): Promise<{ leads: Lead[]; total: number }> {
  const db = await getDb();
  const where = construireWhere(filtres);
  const tri = TRIS[filtres.tri ?? 'date_desc'];
  const limite = Math.min(Math.max(filtres.limite ?? 100, 1), 1000);
  const offset = Math.max(filtres.offset ?? 0, 0);

  // `n` revient en `bigint` texte côté PostgreSQL (`COUNT(*)`) : toujours repasser par `Number(...)`.
  const ligneTotal = await db.get<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM leads WHERE ${where.sql}`,
    where.params,
  );
  const total = Number(ligneTotal?.n ?? 0);

  const lignes = await db.all<LigneLead>(
    `SELECT ${COLONNES} FROM leads WHERE ${where.sql} ORDER BY ${tri} LIMIT ? OFFSET ?`,
    [...where.params, limite, offset],
  );

  return { leads: lignes.map(versLead), total };
}

/** Tous les leads correspondant aux filtres, sans pagination (agrégations). */
export async function listerTousLeads(filtres: FiltresLeads = {}): Promise<Lead[]> {
  const db = await getDb();
  const where = construireWhere(filtres);
  const lignes = await db.all<LigneLead>(
    `SELECT ${COLONNES} FROM leads WHERE ${where.sql} ORDER BY date_reception ASC`,
    where.params,
  );
  return lignes.map(versLead);
}

export async function lireLead(id: string): Promise<Lead | null> {
  const db = await getDb();
  const ligne = await db.get<LigneLead>(
    `SELECT ${COLONNES} FROM leads WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  return ligne ? versLead(ligne) : null;
}

export async function lireLeadParNotionPageId(notionPageId: string): Promise<Lead | null> {
  const db = await getDb();
  const ligne = await db.get<LigneLead>(
    `SELECT ${COLONNES} FROM leads WHERE notion_page_id = ? AND deleted_at IS NULL`,
    [notionPageId],
  );
  return ligne ? versLead(ligne) : null;
}

/** Cherche un doublon récent sur la même clé de déduplication. */
export async function trouverDoublon(
  dedupeKey: string | null,
  fenetreJours?: number,
): Promise<Lead | null> {
  if (!dedupeKey) return null;
  const db = await getDb();
  const fenetre = fenetreJours ?? (await lireReglages()).fenetreDedupeJours;
  const depuis = new Date(Date.now() - fenetre * 86_400_000).toISOString().slice(0, 10);
  const ligne = await db.get<LigneLead>(
    `SELECT ${COLONNES} FROM leads
     WHERE dedupe_key = ? AND date_reception >= ? AND deleted_at IS NULL
     ORDER BY date_reception DESC LIMIT 1`,
    [dedupeKey, depuis],
  );
  return ligne ? versLead(ligne) : null;
}

async function appliquerScoring(champs: {
  segment: Segment;
  relation: Relation;
  typeDemande: TypeDemande;
  initiative: Initiative;
}) {
  return scorerLead(champs, { arbitrageB2cNewsletter: (await lireReglages()).arbitrageB2cNewsletter });
}

export interface OptionsCreation {
  /** Ignore la création si un doublon récent existe (renvoie le lead existant). */
  dedupliquer?: boolean;
  /** Force l'identifiant (import, resynchronisation Notion). */
  id?: string;
  /** Les leads des automatisations attendent une confirmation humaine avant de compter. */
  validationRequise?: boolean;
}

export interface ResultatCreation {
  lead: Lead;
  /** `true` si un doublon a été détecté et qu'aucune ligne n'a été créée. */
  doublon: boolean;
}

export async function creerLead(
  input: LeadParsed,
  options: OptionsCreation = {},
): Promise<ResultatCreation> {
  const db = await getDb();
  const dateReception = input.dateReception ?? aujourdHui();
  const score = await appliquerScoring(input);
  const dedupeKey = calculerDedupeKey({
    email: input.email ?? null,
    telephone: input.telephone ?? null,
    societe: input.societe ?? null,
    typeDemande: input.typeDemande,
    leadMagnet: input.leadMagnet ?? null,
    dateReception,
  });

  if (options.dedupliquer !== false) {
    const existant = await trouverDoublon(dedupeKey);
    if (existant) return { lead: existant, doublon: true };
  }

  const now = maintenantIso();
  const id = options.id ?? nouvelId();
  const params: unknown[] = [
    id,
    dateReception,
    input.nom ?? null,
    input.email ?? null,
    input.telephone ?? null,
    input.societe ?? null,
    input.fonction ?? null,
    input.ville ?? null,
    input.segment,
    input.relation,
    input.typeDemande,
    input.initiative,
    input.sourceCollecte,
    input.campagne ?? null,
    input.leadMagnet ?? null,
    input.message ?? null,
    input.statut,
    input.typeActivation ?? null,
    input.dateActivation ?? null,
    input.proprietaire ?? null,
    JSON.stringify(input.tags ?? []),
    score.eligible ? 1 : 0,
    score.points,
    score.eligibleActivation ? 1 : 0,
    score.regleId,
    score.regleLabel,
    score.explication,
    input.pointsOverride ?? null,
    input.pointsOverrideRaison ?? null,
    options.validationRequise ? 1 : 0,
    options.validationRequise ? 0 : 1,
    input.aVerifier ? 1 : 0,
    input.confiance ?? null,
    dedupeKey,
    input.notionPageId ?? null,
    input.rawPayload === undefined ? null : JSON.stringify(input.rawPayload),
    now,
    now,
  ];

  await db.run(
    `INSERT INTO leads (
      id, date_reception, nom, email, telephone, societe, fonction, ville, segment, relation,
      type_demande, initiative, source_collecte, campagne, lead_magnet, message, statut,
      type_activation, date_activation, proprietaire, tags, eligible, points, eligible_activation,
      regle_id, regle_label, explication, points_override, points_override_raison,
      validation_requise, points_confirmes, a_verifier,
      confiance, dedupe_key, notion_page_id, notion_last_synced_at, raw_payload, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, NULL, ?, ?, ?
    )`,
    params,
  );

  return { lead: (await lireLead(id))!, doublon: false };
}

/** Champs autorisés en mise à jour, avec leur colonne SQL. */
const COLONNES_PATCH: Record<string, string> = {
  dateReception: 'date_reception',
  nom: 'nom',
  email: 'email',
  telephone: 'telephone',
  societe: 'societe',
  fonction: 'fonction',
  ville: 'ville',
  segment: 'segment',
  relation: 'relation',
  typeDemande: 'type_demande',
  initiative: 'initiative',
  sourceCollecte: 'source_collecte',
  campagne: 'campagne',
  leadMagnet: 'lead_magnet',
  message: 'message',
  statut: 'statut',
  typeActivation: 'type_activation',
  dateActivation: 'date_activation',
  proprietaire: 'proprietaire',
  pointsOverride: 'points_override',
  pointsOverrideRaison: 'points_override_raison',
  aVerifier: 'a_verifier',
  confiance: 'confiance',
  notionPageId: 'notion_page_id',
};

export interface OptionsMaj {
  /** Marque le lead comme synchronisé avec Notion à cet instant. */
  notionLastSyncedAt?: string;
  /** N'incrémente pas `updated_at` (utile pour un `pull` Notion). */
  conserverUpdatedAt?: boolean;
}

export async function mettreAJourLead(
  id: string,
  patch: Partial<LeadParsed>,
  options: OptionsMaj = {},
): Promise<Lead | null> {
  const db = await getDb();
  const actuel = await lireLead(id);
  if (!actuel) return null;

  const assignations: string[] = [];
  const params: unknown[] = [];

  for (const [cle, colonne] of Object.entries(COLONNES_PATCH)) {
    if (!(cle in patch)) continue;
    const valeur = (patch as Record<string, unknown>)[cle];
    if (valeur === undefined) continue;
    assignations.push(`${colonne} = ?`);
    params.push(typeof valeur === 'boolean' ? (valeur ? 1 : 0) : valeur);
  }
  if (patch.tags !== undefined) {
    assignations.push('tags = ?');
    params.push(JSON.stringify(patch.tags));
  }
  if (patch.rawPayload !== undefined) {
    assignations.push('raw_payload = ?');
    params.push(JSON.stringify(patch.rawPayload));
  }

  // Re-scoring dès qu'une dimension du moteur change.
  const dimensions = {
    segment: patch.segment ?? actuel.segment,
    relation: patch.relation ?? actuel.relation,
    typeDemande: patch.typeDemande ?? actuel.typeDemande,
    initiative: patch.initiative ?? actuel.initiative,
  };
  const score = await appliquerScoring(dimensions);
  assignations.push(
    'eligible = ?',
    'points = ?',
    'eligible_activation = ?',
    'regle_id = ?',
    'regle_label = ?',
    'explication = ?',
  );
  params.push(
    score.eligible ? 1 : 0,
    score.points,
    score.eligibleActivation ? 1 : 0,
    score.regleId,
    score.regleLabel,
    score.explication,
  );

  const scoreModifie = (['segment', 'relation', 'typeDemande', 'initiative', 'pointsOverride'] as const)
    .some((cle) => patch[cle] !== undefined && patch[cle] !== actuel[cle]);
  if (actuel.validationRequise && scoreModifie) {
    assignations.push('points_confirmes = ?', 'points_confirmes_le = NULL', 'points_confirmes_par = NULL');
    params.push(0);
  }

  // La clé de dédup suit l'identité et la ressource.
  const dedupeKey = calculerDedupeKey({
    email: patch.email !== undefined ? patch.email : actuel.email,
    telephone: patch.telephone !== undefined ? patch.telephone : actuel.telephone,
    societe: patch.societe !== undefined ? patch.societe : actuel.societe,
    typeDemande: dimensions.typeDemande,
    leadMagnet: patch.leadMagnet !== undefined ? patch.leadMagnet : actuel.leadMagnet,
    dateReception: patch.dateReception ?? actuel.dateReception,
  });
  assignations.push('dedupe_key = ?');
  params.push(dedupeKey);

  if (options.notionLastSyncedAt) {
    assignations.push('notion_last_synced_at = ?');
    params.push(options.notionLastSyncedAt);
  }
  assignations.push('updated_at = ?');
  params.push(options.conserverUpdatedAt ? actuel.updatedAt : maintenantIso());

  params.push(id);
  await db.run(`UPDATE leads SET ${assignations.join(', ')} WHERE id = ?`, params);
  return lireLead(id);
}

/** Confirme le score actuellement proposé, sans accepter de score depuis le client. */
export async function confirmerPointsLead(id: string, email: string): Promise<Lead | null> {
  const db = await getDb();
  const maintenant = maintenantIso();
  const resultat = await db.run(
    `UPDATE leads SET points_confirmes = ?, points_confirmes_le = ?,
       points_confirmes_par = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL AND validation_requise = ? AND points_confirmes = ?`,
    [1, maintenant, email, maintenant, id, 1, 0],
  );
  return resultat.changes > 0 ? lireLead(id) : null;
}

export async function marquerSynchronise(
  id: string,
  notionPageId: string,
  quand: string,
): Promise<void> {
  const db = await getDb();
  await db.run('UPDATE leads SET notion_page_id = ?, notion_last_synced_at = ? WHERE id = ?', [
    notionPageId,
    quand,
    id,
  ]);
}

export async function supprimerLead(id: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.run(
    'UPDATE leads SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    [maintenantIso(), maintenantIso(), id],
  );
  return res.changes > 0;
}

/** Leads modifiés localement depuis la dernière synchronisation Notion. */
export async function leadsAPousser(): Promise<Lead[]> {
  const db = await getDb();
  const lignes = await db.all<LigneLead>(
    `SELECT ${COLONNES} FROM leads
     WHERE deleted_at IS NULL
       AND (notion_page_id IS NULL OR notion_last_synced_at IS NULL OR updated_at > notion_last_synced_at)
     ORDER BY updated_at ASC`,
  );
  return lignes.map(versLead);
}

/** Recalcule le score de tous les leads (après changement d'arbitrage). */
export async function rescorerTout(): Promise<number> {
  const db = await getDb();
  const lignes = await db.all<LigneLead>(`SELECT ${COLONNES} FROM leads WHERE deleted_at IS NULL`);
  const now = maintenantIso();
  let n = 0;
  await db.transaction(async (tx) => {
    for (const ligne of lignes) {
      const lead = versLead(ligne);
      const score = await appliquerScoring(lead);
      if (
        score.eligible === lead.eligible &&
        score.points === lead.points &&
        score.eligibleActivation === lead.eligibleActivation &&
        score.regleId === lead.regleId
      ) {
        continue;
      }
      const confirmationAReprendre = lead.validationRequise && (
        score.points !== lead.points ||
        score.eligible !== lead.eligible ||
        score.eligibleActivation !== lead.eligibleActivation
      );
      await tx.run(
        `UPDATE leads SET eligible = ?, points = ?, eligible_activation = ?, regle_id = ?,
           regle_label = ?, explication = ?, points_confirmes = ?, points_confirmes_le = ?,
           points_confirmes_par = ?, updated_at = ? WHERE id = ?`,
        [
          score.eligible ? 1 : 0,
          score.points,
          score.eligibleActivation ? 1 : 0,
          score.regleId,
          score.regleLabel,
          score.explication,
          confirmationAReprendre ? 0 : (lead.pointsConfirmes ? 1 : 0),
          confirmationAReprendre ? null : lead.pointsConfirmesLe,
          confirmationAReprendre ? null : lead.pointsConfirmesPar,
          now,
          lead.id,
        ],
      );
      n++;
    }
  });
  return n;
}
