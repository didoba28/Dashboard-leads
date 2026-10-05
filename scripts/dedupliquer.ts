/**
 * Fusionne les leads en double déjà présents en base.
 *
 * Un même visiteur arrive souvent deux fois le même jour : le formulaire de
 * contact puis le simulateur, ou simplement un double clic. Jusqu'ici la clé de
 * déduplication incluait la ressource demandée, ce qui laissait passer ces
 * paires. La règle est corrigée pour les leads à venir ; ce script répare les
 * leads déjà enregistrés.
 *
 * Par défaut il n'écrit rien : il affiche ce qu'il supprimerait. Ajoutez
 * `--appliquer` pour exécuter.
 *
 *   npx tsx scripts/dedupliquer.ts                 # aperçu
 *   npx tsx scripts/dedupliquer.ts --appliquer     # suppression effective
 *   npx tsx scripts/dedupliquer.ts --fenetre 7     # regroupe sur 7 jours
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb, maintenantIso } from '../src/lib/db';
import { calculerDedupeKey } from '../src/lib/domain/lead';

for (const fichier of ['.env.local', '.env']) {
  const chemin = path.join(process.cwd(), fichier);
  if (!fs.existsSync(chemin)) continue;
  for (const ligne of fs.readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(ligne);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}

interface Ligne {
  id: string;
  date_reception: string;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  societe: string | null;
  type_demande: string;
  lead_magnet: string | null;
  source_collecte: string;
  points: number;
  points_override: number | null;
  statut: string;
  notion_page_id: string | null;
  dedupe_key: string | null;
  created_at: string;
}

function normaliser(v: string | null): string | null {
  if (!v) return null;
  const t = v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@.+]/g, '');
  return t === '' ? null : t;
}

/** Identité d'un lead : e-mail, sinon téléphone, sinon société. */
function identite(l: Ligne): string | null {
  return normaliser(l.email) ?? normaliser(l.telephone) ?? normaliser(l.societe);
}

/**
 * Richesse d'une fiche : à doublon égal, on garde celle qui porte le plus
 * d'information, et jamais celle qui a été modifiée dans Notion.
 */
function richesse(l: Ligne): number {
  let n = 0;
  for (const champ of [l.nom, l.email, l.telephone, l.societe, l.lead_magnet]) if (champ) n += 2;
  // Une fiche issue d'une ingestion automatique porte le contexte d'origine.
  if (l.source_collecte !== 'manuel') n += 1;
  if (l.notion_page_id) n += 5;
  if (l.points_override != null) n += 3;
  if (l.statut !== 'nouveau') n += 2;
  return n;
}

async function principal() {
  const appliquer = process.argv.includes('--appliquer');
  const indexFenetre = process.argv.indexOf('--fenetre');
  const fenetre = indexFenetre >= 0 ? Number(process.argv[indexFenetre + 1] ?? 1) : 1;
  if (!Number.isFinite(fenetre) || fenetre < 1) {
    console.error('La fenêtre doit être un nombre de jours supérieur ou égal à 1.');
    process.exit(1);
  }

  const db = await getDb();
  const lignes = await db.all<Ligne>(
    `SELECT id, date_reception, nom, email, telephone, societe, type_demande, lead_magnet,
            source_collecte, points, points_override, statut, notion_page_id, dedupe_key, created_at
     FROM leads WHERE deleted_at IS NULL
     ORDER BY date_reception ASC, created_at ASC`,
  );

  // Regroupement par identité, puis découpage en grappes de jours consécutifs.
  const parIdentite = new Map<string, Ligne[]>();
  let sansIdentite = 0;
  for (const ligne of lignes) {
    const cle = identite(ligne);
    if (!cle) {
      sansIdentite++;
      continue;
    }
    const liste = parIdentite.get(cle) ?? [];
    liste.push(ligne);
    parIdentite.set(cle, liste);
  }

  const aSupprimer: Array<{ garde: Ligne; retire: Ligne }> = [];
  for (const liste of parIdentite.values()) {
    if (liste.length < 2) continue;
    let grappe: Ligne[] = [];
    const vider = () => {
      if (grappe.length > 1) {
        const garde = [...grappe].sort(
          (a, b) => richesse(b) - richesse(a) || a.created_at.localeCompare(b.created_at),
        )[0]!;
        for (const l of grappe) if (l.id !== garde.id) aSupprimer.push({ garde, retire: l });
      }
      grappe = [];
    };
    for (const ligne of liste) {
      const precedent = grappe[grappe.length - 1];
      if (!precedent) {
        grappe.push(ligne);
        continue;
      }
      const ecartJours =
        (Date.parse(`${ligne.date_reception}T00:00:00Z`) -
          Date.parse(`${precedent.date_reception}T00:00:00Z`)) /
        86_400_000;
      if (ecartJours < fenetre) grappe.push(ligne);
      else {
        vider();
        grappe.push(ligne);
      }
    }
    vider();
  }

  // Les leads enregistrés avant la correction portent une clé calculée à
  // l'ancienne (identité + ressource + jour). Sans recalcul, ils ne seraient
  // jamais reconnus comme doublons d'une future soumission.
  const clesARecalculer = lignes
    .map((l) => ({
      id: l.id,
      attendue: calculerDedupeKey({
        email: l.email,
        telephone: l.telephone,
        societe: l.societe,
        typeDemande: l.type_demande,
        leadMagnet: l.lead_magnet,
        dateReception: l.date_reception,
      }),
      actuelle: l.dedupe_key,
    }))
    .filter((c) => c.attendue !== c.actuelle);

  console.log(`Leads en base       : ${lignes.length}`);
  console.log(`Clés à recalculer   : ${clesARecalculer.length}`);
  if (sansIdentite > 0) {
    console.log(`Sans identité       : ${sansIdentite} (ni e-mail, ni téléphone, ni société — ignorés)`);
  }
  console.log(`Fenêtre             : ${fenetre} jour(s)`);
  console.log(`Doublons détectés   : ${aSupprimer.length}\n`);

  if (aSupprimer.length === 0 && clesARecalculer.length === 0) {
    console.log('Rien à fusionner, rien à recalculer.');
    return;
  }

  if (aSupprimer.length === 0) {
    if (appliquer) {
      await appliquerCles(db, clesARecalculer);
      console.log(`${clesARecalculer.length} clé(s) de déduplication recalculée(s).`);
    } else {
      console.log('Aucun doublon, mais des clés sont à recalculer. Relancez avec --appliquer.');
    }
    return;
  }

  for (const { garde, retire } of aSupprimer) {
    const qui = retire.nom ?? retire.email ?? retire.id;
    console.log(`  ${qui} — ${retire.date_reception}`);
    console.log(`     retiré : ${retire.type_demande} via ${retire.source_collecte} (${retire.points} pt)`);
    console.log(`     gardé  : ${garde.type_demande} via ${garde.source_collecte} (${garde.points} pt)`);
  }

  const pointsRetires =
    Math.round(aSupprimer.reduce((n, d) => n + (d.retire.points_override ?? d.retire.points), 0) * 100) / 100;
  console.log(`\n${aSupprimer.length} lead(s) à retirer, soit ${pointsRetires} point(s) en trop.`);

  if (!appliquer) {
    console.log('\nAperçu seulement. Relancez avec --appliquer pour supprimer.');
    return;
  }

  const maintenant = maintenantIso();
  const retires = new Set(aSupprimer.map((d) => d.retire.id));
  await db.transaction(async (tx) => {
    for (const { retire } of aSupprimer) {
      await tx.run('UPDATE leads SET deleted_at = ?, updated_at = ? WHERE id = ?', [
        maintenant,
        maintenant,
        retire.id,
      ]);
    }
    for (const cle of clesARecalculer) {
      if (retires.has(cle.id)) continue;
      await tx.run('UPDATE leads SET dedupe_key = ? WHERE id = ?', [cle.attendue, cle.id]);
    }
  });
  console.log(`\n${aSupprimer.length} doublon(s) supprimé(s).`);
  const recalculees = clesARecalculer.filter((c) => !retires.has(c.id)).length;
  if (recalculees > 0) console.log(`${recalculees} clé(s) de déduplication recalculée(s).`);
}

/** Recalcule les clés hors transaction de suppression (cas sans doublon). */
async function appliquerCles(
  db: Awaited<ReturnType<typeof getDb>>,
  cles: Array<{ id: string; attendue: string | null }>,
) {
  await db.transaction(async (tx) => {
    for (const cle of cles) {
      await tx.run('UPDATE leads SET dedupe_key = ? WHERE id = ?', [cle.attendue, cle.id]);
    }
  });
}

principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
