/**
 * Synchronisation bidirectionnelle avec Notion.
 *
 * Principe : le dashboard reste la source de vérité du *scoring* (les points
 * sont toujours recalculés localement), Notion reste un espace de travail
 * confortable pour l'équipe. Les modifications faites dans Notion sur les
 * champs métier (statut, segment, relation…) redescendent, sont re-scorées,
 * puis remontent corrigées.
 *
 * Arbitrage des conflits : dernier écrivain gagnant, en comparant
 * `last_edited_time` côté Notion et `updated_at` côté local.
 */
import { collectPaginatedAPI, isFullPage } from '@notionhq/client';
import { getNotion, notionEstConfigure } from './client';
import { P, PROPRIETES, depuisPageNotion, versProprietesNotion } from './schema';
import {
  creerLead,
  leadsAPousser,
  lireLead,
  lireLeadParNotionPageId,
  marquerSynchronise,
  mettreAJourLead,
} from '@/lib/db/leads';
import { ecrireReglages, lireReglages } from '@/lib/db/settings';
import { getDb, maintenantIso, nouvelId } from '@/lib/db';
import { schemaLeadInput } from '@/lib/domain/lead';

export interface ResultatSync {
  succes: boolean;
  direction: 'pull' | 'push' | 'bidirectionnel';
  crees: number;
  maj: number;
  ignores: number;
  erreurs: string[];
  dureeMs: number;
  lanceLe: string;
}

interface Cible {
  databaseId: string;
  dataSourceId: string;
}

/** Résout la base et la data source Notion à utiliser. */
export async function resoudreCible(): Promise<Cible> {
  const reglages = await lireReglages();
  const databaseId = process.env.NOTION_DATABASE_ID ?? reglages.notionDatabaseId;
  if (!databaseId) {
    throw new Error(
      "Aucune base Notion connectée. Lancez la configuration (« Connecter Notion ») ou renseignez NOTION_DATABASE_ID.",
    );
  }
  if (reglages.notionDataSourceId && reglages.notionDatabaseId === databaseId) {
    return { databaseId, dataSourceId: reglages.notionDataSourceId };
  }
  const notion = getNotion();
  const base = await notion.databases.retrieve({ database_id: databaseId });
  const dataSourceId = (base as { data_sources?: Array<{ id: string }> }).data_sources?.[0]?.id;
  if (!dataSourceId) throw new Error(`La base Notion ${databaseId} n'expose aucune data source.`);
  await ecrireReglages({ notionDatabaseId: databaseId, notionDataSourceId: dataSourceId });
  return { databaseId, dataSourceId };
}

export interface ResultatSetup {
  databaseId: string;
  dataSourceId: string;
  url: string | null;
  cree: boolean;
  proprietesAjoutees: string[];
}

/**
 * Prépare la base Notion : soit on rattache une base existante et on complète
 * les propriétés manquantes, soit on en crée une sous la page parente.
 */
export async function configurerNotion(params: {
  databaseId?: string;
  parentPageId?: string;
  titre?: string;
} = {}): Promise<ResultatSetup> {
  const notion = getNotion();
  const databaseId = params.databaseId ?? process.env.NOTION_DATABASE_ID ?? null;

  if (databaseId) {
    const base = await notion.databases.retrieve({ database_id: databaseId });
    const dataSourceId = (base as { data_sources?: Array<{ id: string }> }).data_sources?.[0]?.id;
    if (!dataSourceId) throw new Error(`La base Notion ${databaseId} n'expose aucune data source.`);

    const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
    const existantes = new Set(Object.keys((dataSource as { properties: object }).properties));
    const manquantes: Record<string, unknown> = {};
    for (const [nom, definition] of Object.entries(PROPRIETES)) {
      // La propriété titre existe toujours, sous un nom potentiellement différent.
      if (nom === P.nom || existantes.has(nom)) continue;
      manquantes[nom] = definition;
    }
    if (Object.keys(manquantes).length > 0) {
      await notion.dataSources.update({
        data_source_id: dataSourceId,
        properties: manquantes as never,
      });
    }
    await ecrireReglages({ notionDatabaseId: databaseId, notionDataSourceId: dataSourceId });
    return {
      databaseId,
      dataSourceId,
      url: (base as { url?: string }).url ?? null,
      cree: false,
      proprietesAjoutees: Object.keys(manquantes),
    };
  }

  const parentPageId = params.parentPageId ?? process.env.NOTION_PARENT_PAGE_ID;
  if (!parentPageId) {
    throw new Error(
      'Pour créer la base, renseignez NOTION_PARENT_PAGE_ID (identifiant de la page Notion qui hébergera la base).',
    );
  }
  const base = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: params.titre ?? 'Leads entrants — Growth' } }],
    initial_data_source: { properties: PROPRIETES as never },
  });
  const dataSourceId = (base as { data_sources?: Array<{ id: string }> }).data_sources?.[0]?.id;
  if (!dataSourceId) throw new Error("La base Notion créée n'expose aucune data source.");
  await ecrireReglages({ notionDatabaseId: base.id, notionDataSourceId: dataSourceId });
  return {
    databaseId: base.id,
    dataSourceId,
    url: (base as { url?: string }).url ?? null,
    cree: true,
    proprietesAjoutees: Object.keys(PROPRIETES),
  };
}

/** Descend les modifications faites dans Notion vers le dashboard. */
export async function pullDepuisNotion(): Promise<ResultatSync> {
  const debut = Date.now();
  const lanceLe = maintenantIso();
  const resultat: ResultatSync = {
    succes: true, direction: 'pull', crees: 0, maj: 0, ignores: 0, erreurs: [], dureeMs: 0, lanceLe,
  };

  try {
    const notion = getNotion();
    const { dataSourceId } = await resoudreCible();
    const reglages = await lireReglages();
    // Marge de 5 minutes pour absorber les décalages d'horloge.
    const depuis = reglages.notionDernierPull
      ? new Date(Date.parse(reglages.notionDernierPull) - 5 * 60_000).toISOString()
      : null;

    const pages = await collectPaginatedAPI(notion.dataSources.query, {
      data_source_id: dataSourceId,
      ...(depuis
        ? { filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: depuis } } }
        : {}),
      page_size: 100,
    } as never);

    for (const page of pages) {
      if (!isFullPage(page)) continue;
      try {
        const { patch, idDashboard } = depuisPageNotion(page);
        const existant =
          (await lireLeadParNotionPageId(page.id)) ?? (idDashboard ? await lireLead(idDashboard) : null);

        if (!existant) {
          const parsed = schemaLeadInput.parse({
            ...patch,
            sourceCollecte: patch.sourceCollecte ?? 'notion',
            notionPageId: page.id,
          });
          const { lead, doublon } = await creerLead(parsed, { dedupliquer: false });
          if (doublon) {
            resultat.ignores++;
          } else {
            await marquerSynchronise(lead.id, page.id, page.last_edited_time);
            resultat.crees++;
          }
          continue;
        }

        // Rien n'a bougé côté Notion depuis notre dernière écriture.
        if (existant.notionLastSyncedAt === page.last_edited_time) {
          resultat.ignores++;
          continue;
        }
        // Le local est plus récent : c'est le push qui tranchera.
        if (Date.parse(existant.updatedAt) > Date.parse(page.last_edited_time)) {
          resultat.ignores++;
          continue;
        }

        const parsed = schemaLeadInput.partial().parse(patch);
        await mettreAJourLead(existant.id, parsed);
        await marquerSynchronise(existant.id, page.id, page.last_edited_time);
        resultat.maj++;
      } catch (err) {
        resultat.erreurs.push(`Page ${page.id} : ${messageErreur(err)}`);
      }
    }
    await ecrireReglages({ notionDernierPull: lanceLe });
  } catch (err) {
    resultat.succes = false;
    resultat.erreurs.push(messageErreur(err));
  }

  resultat.dureeMs = Date.now() - debut;
  await journaliser(resultat);
  return resultat;
}

/** Remonte les leads créés ou modifiés localement vers Notion. */
export async function pushVersNotion(): Promise<ResultatSync> {
  const debut = Date.now();
  const lanceLe = maintenantIso();
  const resultat: ResultatSync = {
    succes: true, direction: 'push', crees: 0, maj: 0, ignores: 0, erreurs: [], dureeMs: 0, lanceLe,
  };

  try {
    const notion = getNotion();
    const { dataSourceId } = await resoudreCible();
    for (const lead of await leadsAPousser()) {
      try {
        const properties = versProprietesNotion(lead) as never;
        if (lead.notionPageId) {
          const page = await notion.pages.update({ page_id: lead.notionPageId, properties });
          await marquerSynchronise(
            lead.id,
            lead.notionPageId,
            (page as { last_edited_time: string }).last_edited_time,
          );
          resultat.maj++;
        } else {
          const page = await notion.pages.create({
            parent: { type: 'data_source_id', data_source_id: dataSourceId },
            properties,
          });
          await marquerSynchronise(lead.id, page.id, (page as { last_edited_time: string }).last_edited_time);
          resultat.crees++;
        }
      } catch (err) {
        resultat.erreurs.push(`Lead ${lead.id} : ${messageErreur(err)}`);
      }
    }
  } catch (err) {
    resultat.succes = false;
    resultat.erreurs.push(messageErreur(err));
  }

  resultat.dureeMs = Date.now() - debut;
  await journaliser(resultat);
  return resultat;
}

/** Cycle complet : on descend d'abord, on remonte ensuite. */
export async function synchroniser(): Promise<ResultatSync> {
  const debut = Date.now();
  const pull = await pullDepuisNotion();
  const push = await pushVersNotion();
  return {
    succes: pull.succes && push.succes,
    direction: 'bidirectionnel',
    crees: pull.crees + push.crees,
    maj: pull.maj + push.maj,
    ignores: pull.ignores + push.ignores,
    erreurs: [...pull.erreurs, ...push.erreurs],
    dureeMs: Date.now() - debut,
    lanceLe: pull.lanceLe,
  };
}

export interface EtatNotion {
  configure: boolean;
  databaseId: string | null;
  dataSourceId: string | null;
  dernierPull: string | null;
  enAttenteDePush: number;
  derniersRuns: ResultatSync[];
}

export async function etatNotion(): Promise<EtatNotion> {
  const reglages = await lireReglages();
  return {
    configure: notionEstConfigure(),
    databaseId: process.env.NOTION_DATABASE_ID ?? reglages.notionDatabaseId,
    dataSourceId: reglages.notionDataSourceId,
    dernierPull: reglages.notionDernierPull,
    enAttenteDePush: notionEstConfigure() ? (await leadsAPousser()).length : 0,
    derniersRuns: await lireJournal(5),
  };
}

async function journaliser(r: ResultatSync): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO journal_sync (id, lance_le, direction, crees, maj, ignores, erreurs, duree_ms, succes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nouvelId(), r.lanceLe, r.direction, r.crees, r.maj, r.ignores, JSON.stringify(r.erreurs), r.dureeMs, r.succes ? 1 : 0],
  );
}

interface LigneJournal {
  lance_le: string;
  direction: string;
  crees: number;
  maj: number;
  ignores: number;
  erreurs: string;
  duree_ms: number;
  // SQLite renvoie 0/1, PostgreSQL renvoie un booléen natif.
  succes: number | boolean;
}

export async function lireJournal(limite = 20): Promise<ResultatSync[]> {
  const db = await getDb();
  const lignes = await db.all<LigneJournal>(
    'SELECT * FROM journal_sync ORDER BY lance_le DESC LIMIT ?',
    [limite],
  );
  return lignes.map((l) => ({
    succes: Boolean(l.succes),
    direction: l.direction as ResultatSync['direction'],
    crees: l.crees,
    maj: l.maj,
    ignores: l.ignores,
    erreurs: JSON.parse(l.erreurs) as string[],
    dureeMs: l.duree_ms,
    lanceLe: l.lance_le,
  }));
}

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
