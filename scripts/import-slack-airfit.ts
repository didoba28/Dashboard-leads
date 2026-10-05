/**
 * Rattrapage des leads réels du canal Slack #inbound_sales.
 *
 * Les leads y sont postés par Make depuis juillet 2026, mais n'avaient jamais
 * été comptabilisés nulle part. Ce script reprend l'historique complet, écarte
 * ce qui n'est pas un lead, et laisse le moteur de règles attribuer les points.
 *
 * Trois familles sont écartées, chacune pour une raison différente :
 *  - les tests (`test@example.com`, nom « TEST », téléphones à chiffre répété) ;
 *  - les soumissions internes (adresses @airfit.co : l'équipe qui teste ses
 *    propres formulaires) ;
 *  - les doublons : même personne, même jour. Deux cas se présentent — la même
 *    ressource soumise deux fois à une minute d'intervalle (double clic), et le
 *    formulaire de contact suivi du simulateur dans la foulée. Dans les deux
 *    cas une seule demande entrante a eu lieu, donc un seul lead.
 *
 * Lancement : npx tsx scripts/import-slack-airfit.ts [--reset]
 */
import fs from 'node:fs';
import path from 'node:path';
import { creerLead } from '../src/lib/db/leads';
import { getDb } from '../src/lib/db';
import { schemaLeadInput } from '../src/lib/domain/lead';
import { scorerLead } from '../src/lib/domain/scoring';
import type { Segment, TypeDemande } from '../src/lib/domain/taxonomy';

for (const fichier of ['.env.local', '.env']) {
  const chemin = path.join(process.cwd(), fichier);
  if (!fs.existsSync(chemin)) continue;
  for (const ligne of fs.readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(ligne);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}

interface LeadSlack {
  date: string;
  nom: string;
  ville: string | null;
  email: string;
  telephone: string | null;
  segment: Segment;
  typeDemande: TypeDemande;
  leadMagnet: string | null;
  tags: string[];
  /** Pourquoi ce segment, quand il ne se devine pas à l'œil nu. */
  note?: string;
}

/**
 * Leads retenus, du plus ancien au plus récent.
 *
 * Le segment « collectivite » est établi sur le domaine de l'adresse : soit il
 * nomme la commune (`doudeville.fr` pour Doudeville), soit il porte un préfixe
 * public explicite (`mairie-callac.fr`, `ville-voreppe.fr`).
 */
const LEADS: LeadSlack[] = [
  {
    date: '2026-07-07', nom: 'Pascal Bouchez', ville: 'Voreppe',
    email: 'pascal.bouchez@ville-voreppe.fr', telephone: '0764471070',
    segment: 'collectivite', typeDemande: 'simulateur',
    leadMagnet: 'Fitness Intergénérationnel – Portet-sur-Garonne',
    tags: ['Pratiquants libres', 'Seniors et sédentaires', 'Abords de voie pédestre'],
    note: 'domaine ville-voreppe.fr',
  },
  {
    date: '2026-07-09', nom: 'Angélique Rafignon', ville: 'Callac',
    email: 'a.rafignon@mairie-callac.fr', telephone: '0611105217',
    segment: 'collectivite', typeDemande: 'simulateur',
    leadMagnet: 'Fitness Outdoor & Appareils Guidés – Bellignat',
    tags: ['Pratiquants libres', 'Seniors et sédentaires', 'Parc & base de loisirs'],
    note: 'domaine mairie-callac.fr',
  },
  {
    date: '2026-07-12', nom: 'Fabrice Michelet', ville: 'Chef-Boutonne',
    email: 'fabrice.michelet@chef-boutonne.fr', telephone: '0608992378',
    segment: 'collectivite', typeDemande: 'simulateur',
    leadMagnet: 'Street-Workout – La Teste-De-Buch',
    tags: ['Pratiquants libres', 'Entre 150 et 200 m2'],
    note: 'domaine chef-boutonne.fr, fonction déclarée « maire »',
  },
  {
    date: '2026-08-29', nom: 'Olivier Marousez', ville: 'Hélesmes',
    email: 'olivier.marousez@bbox.fr', telephone: '0632347811',
    segment: 'b2c', typeDemande: 'simulateur',
    leadMagnet: 'Projet compatible identifié',
    tags: ['Pratiquants libres', 'Complexe sportif'],
  },
  {
    date: '2026-09-10', nom: 'Hélène Ryckelynck', ville: 'Warhem',
    email: 'wilfried.vanrechem@neuf.fr', telephone: '0688045560',
    segment: 'b2c', typeDemande: 'simulateur',
    leadMagnet: 'Projet compatible identifié',
    tags: ['Associations et groupes sportifs', 'Enfants et groupes scolaires'],
    note: 'formulaire de contact + simulateur à une minute d’intervalle, compté une fois',
  },
  {
    date: '2026-09-14', nom: 'Soupramaniane Siva', ville: 'Orléans',
    email: 'sousou6345@gmail.com', telephone: '0664511181',
    segment: 'b2c', typeDemande: 'simulateur',
    leadMagnet: 'Projet compatible identifié',
    tags: ['Pratiquants libres', 'Associations et groupes sportifs'],
    note: 'deux soumissions à quatre minutes d’intervalle, comptées une fois',
  },
  {
    date: '2026-09-15', nom: 'Alexandre Perna', ville: 'Saint-Sauveur',
    email: 'alexandre.perna@saint-sauveur60.fr', telephone: '0627143570',
    segment: 'collectivite', typeDemande: 'simulateur',
    leadMagnet: 'Projet compatible identifié',
    tags: ['Pratiquants libres', 'Complexe sportif', 'Entre 20k et 30k EUR'],
    note: 'domaine saint-sauveur60.fr correspondant à la ville',
  },
  {
    date: '2026-09-18', nom: 'Christophe Malins', ville: 'Saint-Savin',
    email: 'cmalins@saintsavin-isere.fr', telephone: '+33786914726',
    segment: 'collectivite', typeDemande: 'formulaire_contact',
    leadMagnet: 'Formulaire contact — landing simulateur',
    tags: [],
    note: 'domaine saintsavin-isere.fr correspondant à la ville',
  },
  {
    date: '2026-09-18', nom: 'Céline Anciaux', ville: 'Avrechy',
    email: 'celine.anciaux@yahoo.fr', telephone: '0752061524',
    segment: 'b2c', typeDemande: 'simulateur',
    leadMagnet: 'Projet compatible identifié',
    tags: ['Pratiquants libres', 'Parc & base de loisirs', 'Entre 10k et 20k EUR'],
  },
  {
    date: '2026-09-21', nom: 'Titouan de Cuniac', ville: 'Nancy',
    email: 'titoiauznd@gmail.com', telephone: '+32471744732',
    segment: 'b2c', typeDemande: 'simulateur',
    leadMagnet: 'Projet compatible identifié',
    tags: ['Pratiquants libres', 'Sportifs aguerris', 'Entre 10k et 20k EUR'],
  },
  {
    date: '2026-09-23', nom: 'Brigitte Russo', ville: 'Besse-sur-Issole',
    email: 'brusso.besse@orange.fr', telephone: '0661172310',
    segment: 'b2c', typeDemande: 'simulateur',
    leadMagnet: 'Projet compatible identifié',
    tags: ['Pratiquants libres', 'Parc & base de loisirs', 'Entre 30k et 40k EUR'],
    note: 'adresse personnelle, mais le nom contient la commune — à vérifier, peut-être une élue',
  },
  {
    date: '2026-09-23', nom: 'Anne Blouin', ville: 'Saint-Pantaléon-de-Larche',
    email: 'ablouin@dejante-infra.com', telephone: '0636084350',
    segment: 'b2b', typeDemande: 'simulateur',
    leadMagnet: 'Projet compatible identifié',
    tags: ['Associations et groupes sportifs', 'Enfants et groupes scolaires', 'Entre 20k et 30k EUR'],
    note: 'entreprise d’infrastructure — vérifier que ce n’est pas un installateur partenaire',
  },
  {
    date: '2026-09-28', nom: 'Pavlo Vakoulenko', ville: 'Aubagne',
    email: 'vakulenko527@gmail.com', telephone: '0651954266',
    segment: 'b2c', typeDemande: 'simulateur',
    leadMagnet: 'Projet compatible identifié',
    tags: ['Pratiquants libres', 'Quartier & zone résidentielle'],
    note: 'deux soumissions à une minute d’intervalle, comptées une fois',
  },
  {
    date: '2026-09-28', nom: 'Alexandra Gillon', ville: 'Doudeville',
    email: 'alexandra.gillon@doudeville.fr', telephone: '0623185130',
    segment: 'collectivite', typeDemande: 'simulateur',
    leadMagnet: 'Projet compatible identifié',
    tags: ['Pratiquants libres', 'Complexe sportif'],
    note: 'domaine doudeville.fr correspondant à la ville',
  },
  {
    date: '2026-09-30', nom: 'Javier Duce Martinez', ville: 'Vila-seca (Espagne)',
    email: 'javier@estivalpark.es', telephone: '+34610714294',
    segment: 'b2b', typeDemande: 'simulateur',
    leadMagnet: 'Projet compatible identifié',
    tags: ['Public familial', 'Complexe hôtelier et camping', 'Entre 30k et 40k EUR'],
    note: 'complexe hôtelier espagnol ; contact + simulateur le même jour, comptés une fois',
  },
  {
    date: '2026-10-03', nom: 'Sidy Huchard', ville: 'Quimper',
    email: 'sidyhuchard33@gmail.com', telephone: '0609611089',
    segment: 'b2c', typeDemande: 'simulateur',
    leadMagnet: 'Étude de cas : Cuges-les-Pins',
    tags: ['Pratiquants libres', 'Quartier & zone résidentielle', 'Entre 10k et 20k EUR'],
  },
  {
    date: '2026-10-04', nom: 'Jean-Jacques Parisot', ville: 'Izel-lès-Équerchin',
    email: 'jean-jacques.parisot@izellesequerchin.fr', telephone: '0608168691',
    segment: 'collectivite', typeDemande: 'simulateur',
    leadMagnet: 'Étude de cas : Théza',
    tags: ['Pratiquants libres', 'Parc & base de loisirs', 'Entre 10k et 20k EUR'],
    note: 'domaine izellesequerchin.fr correspondant à la ville',
  },
  {
    date: '2026-10-05', nom: 'Karen Douglas', ville: 'Le Lamentin',
    email: 'douglaskaren09@gmail.com', telephone: '+590690194156',
    segment: 'b2c', typeDemande: 'formulaire_contact',
    leadMagnet: 'Formulaire contact — landing simulateur',
    tags: [],
  },
];

/** Écartés, avec le motif — conservé pour que le rattrapage soit auditable. */
const ECARTES: Array<{ quoi: string; motif: string; combien: number }> = [
  { quoi: 'test@example.com, « TEST », téléphones à chiffre répété', motif: 'leads de test', combien: 6 },
  { quoi: 'adel@airfit.co, aurelien@airfit.co', motif: 'soumissions internes de l’équipe', combien: 6 },
  { quoi: 'Vakoulenko, Siva, Ryckelynck, Duce Martinez', motif: 'doublons le même jour', combien: 4 },
];

async function principal() {
  const reset = process.argv.includes('--reset');
  const db = await getDb();

  if (reset) {
    await db.exec('DELETE FROM leads');
    console.log('Base vidée : les données de démonstration sont supprimées.\n');
  } else {
    const n = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM leads WHERE deleted_at IS NULL');
    if (Number(n?.n ?? 0) > 0) {
      console.error(
        `La base contient déjà ${Number(n?.n ?? 0)} lead(s). Relancez avec --reset pour repartir des seuls leads réels.`,
      );
      process.exit(1);
    }
  }

  let crees = 0;
  let doublons = 0;
  for (const lead of LEADS) {
    const parsed = schemaLeadInput.parse({
      dateReception: lead.date,
      nom: lead.nom,
      email: lead.email,
      telephone: lead.telephone,
      ville: lead.ville,
      segment: lead.segment,
      relation: 'prospect',
      typeDemande: lead.typeDemande,
      initiative: 'inbound_site',
      sourceCollecte: 'slack_inbound',
      leadMagnet: lead.leadMagnet,
      message: lead.note ?? null,
      statut: 'nouveau',
      tags: lead.tags,
      aVerifier: Boolean(lead.note),
      rawPayload: { source: 'rattrapage-slack', canal: '#inbound_sales' },
    });
    const { doublon } = await creerLead(parsed, { dedupliquer: true });
    if (doublon) doublons++;
    else crees++;
  }

  const total = LEADS.reduce(
    (n, l) => n + scorerLead({ segment: l.segment, relation: 'prospect', typeDemande: l.typeDemande, initiative: 'inbound_site' }).points,
    0,
  );
  const t3 = LEADS.filter((l) => l.date < '2026-10-01');
  const t4 = LEADS.filter((l) => l.date >= '2026-10-01');
  const points = (liste: LeadSlack[]) =>
    liste.reduce(
      (n, l) => n + scorerLead({ segment: l.segment, relation: 'prospect', typeDemande: l.typeDemande, initiative: 'inbound_site' }).points,
      0,
    );

  console.log('--- Rattrapage du canal #inbound_sales ---');
  console.log(`Leads réels importés : ${crees}${doublons > 0 ? ` (${doublons} doublon(s) ignoré(s))` : ''}`);
  console.log(`T3 2026 : ${t3.length} leads, ${points(t3)} points`);
  console.log(`T4 2026 : ${t4.length} leads, ${points(t4)} points`);
  console.log(`Total    : ${LEADS.length} leads, ${total} points\n`);
  console.log('Écartés :');
  for (const e of ECARTES) console.log(`  ${String(e.combien).padStart(2)} — ${e.motif} (${e.quoi})`);
}

principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
