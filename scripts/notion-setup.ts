#!/usr/bin/env npx tsx
/**
 * Prépare la base Notion utilisée par la synchronisation : rattache une base
 * existante (et complète ses propriétés manquantes) ou en crée une nouvelle.
 *
 * Usage : npx tsx scripts/notion-setup.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { configurerNotion } from '@/lib/notion/sync';

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

async function main(): Promise<void> {
  try {
    const resultat = await configurerNotion();
    console.log(resultat.cree ? 'Base Notion créée.' : 'Base Notion existante mise à jour.');
    console.log(`  databaseId   : ${resultat.databaseId}`);
    console.log(`  dataSourceId : ${resultat.dataSourceId}`);
    console.log(`  url          : ${resultat.url ?? '(inconnue)'}`);
    console.log(
      resultat.proprietesAjoutees.length > 0
        ? `  propriétés ajoutées : ${resultat.proprietesAjoutees.join(', ')}`
        : '  aucune propriété à ajouter (base déjà à jour).',
    );
  } catch (err) {
    console.error('Échec de la configuration Notion.');
    console.error(err instanceof Error ? err.message : String(err));
    console.error('');
    console.error('Variables attendues : NOTION_TOKEN, et NOTION_DATABASE_ID ou NOTION_PARENT_PAGE_ID.');
    process.exit(1);
  }
}

void main();
