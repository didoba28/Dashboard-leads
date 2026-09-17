#!/usr/bin/env npx tsx
/**
 * Lance une synchronisation Notion.
 *
 * Usage : npx tsx scripts/notion-sync.ts [--pull|--push]
 * Sans option : synchronisation bidirectionnelle (pull puis push).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pullDepuisNotion, pushVersNotion, synchroniser, type ResultatSync } from '@/lib/notion/sync';

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

function afficherResultat(resultat: ResultatSync): void {
  console.log(`Direction : ${resultat.direction}`);
  console.log(`Créés     : ${resultat.crees}`);
  console.log(`Mis à jour: ${resultat.maj}`);
  console.log(`Ignorés   : ${resultat.ignores}`);
  console.log(`Durée     : ${resultat.dureeMs} ms`);
  if (resultat.erreurs.length > 0) {
    console.log('Erreurs :');
    for (const e of resultat.erreurs) console.log(`  - ${e}`);
  }
}

async function main(): Promise<void> {
  const pull = process.argv.includes('--pull');
  const push = process.argv.includes('--push');

  const resultat = pull ? await pullDepuisNotion() : push ? await pushVersNotion() : await synchroniser();

  afficherResultat(resultat);

  if (!resultat.succes) process.exit(1);
}

void main();
