/**
 * Ingestion générique de formulaire (endpoint appelé par les automatisations type
 * Make/Zapier) : accepte des champs bruts et/ou des dimensions déjà qualifiées, les
 * dimensions explicitement fournies primant toujours sur ce que devine le classifieur.
 */
import { z } from 'zod';
import { valeurVersCle } from '@/lib/csv';
import { classifier, SEUIL_CONFIANCE } from '@/lib/domain/classify';
import { aujourdHui, type LeadInput } from '@/lib/domain/lead';
import {
  LABELS_INITIATIVE,
  LABELS_RELATION,
  LABELS_SEGMENT,
  LABELS_TYPE_DEMANDE,
  SOURCES_COLLECTE,
} from '@/lib/domain/taxonomy';

const texteCourt = (max: number) => z.string().trim().max(max).optional();

/** Schéma d'une entrée de formulaire générique (objet unique ou élément d'un lot). */
export const schemaFormulaire = z
  .object({
    // Identité
    nom: texteCourt(120),
    prenom: texteCourt(120),
    email: z
      .union([z.string().trim().email('E-mail invalide'), z.literal('')])
      .transform((v) => (v ? v.toLowerCase() : null))
      .optional(),
    telephone: texteCourt(40),
    societe: texteCourt(160),
    fonction: texteCourt(160),
    ville: texteCourt(120),

    // Contexte
    sujet: texteCourt(200),
    message: z
      .string()
      .trim()
      .max(5000)
      .optional(),
    url: texteCourt(2000),
    campagne: texteCourt(160),
    leadMagnet: texteCourt(200),
    formulaire: texteCourt(200),
    recuLe: texteCourt(40),

    // Dimensions explicites : clé technique ou libellé français, résolues dans
    // `leadDepuisFormulaire` (une valeur non reconnue n'est pas une erreur : on
    // se replie simplement sur la déduction du classifieur).
    segment: texteCourt(60),
    relation: texteCourt(60),
    typeDemande: texteCourt(60),
    initiative: texteCourt(60),

    champs: z.record(z.string(), z.string()).optional(),

    pointsForces: z.union([z.literal(0), z.literal(0.5), z.literal(1)]).optional(),
    raisonPointsForces: texteCourt(300),

    sourceCollecte: z.enum(SOURCES_COLLECTE).default('email_formulaire'),
  })
  .passthrough()
  .refine(
    (v) =>
      Boolean(v.email) ||
      Boolean(v.telephone?.trim()) ||
      Boolean(v.societe?.trim()) ||
      Boolean(v.message?.trim()) ||
      Boolean(v.sujet?.trim()),
    {
      message:
        'Au moins un identifiant (email, téléphone, société) ou un message/sujet doit être renseigné.',
    },
  );

export type EntreeFormulaire = z.infer<typeof schemaFormulaire>;

/** Le lead prêt pour `schemaLeadInput`, augmenté de la liste des dimensions fournies explicitement. */
export type LeadDepuisFormulaireResultat = LeadInput & { dimensionsFournies: string[] };

const LONGUEUR_MAX_MESSAGE = 5000;

function dateDepuisRecuLe(recuLe: string | undefined): string {
  if (!recuLe) return aujourdHui();
  const m = /^\d{4}-\d{2}-\d{2}/.exec(recuLe);
  if (m) return m[0];
  const d = new Date(recuLe);
  return Number.isNaN(d.getTime()) ? aujourdHui() : d.toISOString().slice(0, 10);
}

/** Résout une dimension fournie en clair (clé technique ou libellé). `undefined` si absente ou non reconnue. */
function champDimension<T extends string>(
  valeur: string | undefined,
  labels: Record<T, string>,
): T | undefined {
  if (!valeur || !valeur.trim()) return undefined;
  const cle = valeurVersCle(valeur, labels);
  return cle ? (cle as T) : undefined;
}

/** Construit un lead (au format `schemaLeadInput`) à partir d'une entrée de formulaire générique. */
export function leadDepuisFormulaire(entree: EntreeFormulaire): LeadDepuisFormulaireResultat {
  const lignesChamps = Object.entries(entree.champs ?? {}).map(([cle, valeur]) => `${cle} : ${valeur}`);
  const corps = [entree.message ?? '', ...lignesChamps].filter(Boolean).join('\n');
  const resultat = classifier({ sujet: entree.sujet ?? null, corps, url: entree.url ?? null });

  const dimensionsFournies: string[] = [];

  const segmentFourni = champDimension(entree.segment, LABELS_SEGMENT);
  if (segmentFourni) dimensionsFournies.push('segment');
  const relationFournie = champDimension(entree.relation, LABELS_RELATION);
  if (relationFournie) dimensionsFournies.push('relation');
  const typeDemandeFourni = champDimension(entree.typeDemande, LABELS_TYPE_DEMANDE);
  if (typeDemandeFourni) dimensionsFournies.push('typeDemande');
  const initiativeFournie = champDimension(entree.initiative, LABELS_INITIATIVE);
  if (initiativeFournie) dimensionsFournies.push('initiative');

  // Aucune dimension à deviner : la classification automatique n'a rien approximé.
  const confiance = dimensionsFournies.length === 4 ? 1 : resultat.confiance;

  const nom = [entree.prenom, entree.nom].filter((v) => v?.trim()).join(' ').trim() || resultat.nom;

  return {
    dateReception: dateDepuisRecuLe(entree.recuLe),
    nom: nom || null,
    email: entree.email ?? resultat.email,
    telephone: entree.telephone || resultat.telephone,
    societe: entree.societe || resultat.societe,
    fonction: entree.fonction || null,
    ville: entree.ville || resultat.ville,
    segment: segmentFourni ?? resultat.segment,
    relation: relationFournie ?? resultat.relation,
    typeDemande: typeDemandeFourni ?? resultat.typeDemande,
    initiative: initiativeFournie ?? resultat.initiative,
    sourceCollecte: entree.sourceCollecte,
    campagne: entree.campagne || resultat.campagne,
    leadMagnet: entree.leadMagnet || resultat.leadMagnet,
    message: (corps || entree.sujet || '').slice(0, LONGUEUR_MAX_MESSAGE) || null,
    // Make peut suggérer des points dans le détail transmis, mais ne valide pas
    // un arbitrage : cette décision appartient à la personne dans le dashboard.
    pointsOverride: null,
    pointsOverrideRaison: null,
    aVerifier: confiance < SEUIL_CONFIANCE,
    confiance,
    rawPayload: {
      source: 'formulaire',
      formulaire: entree.formulaire ?? null,
      champs: entree.champs ?? null,
      dimensionsFournies,
      donnees: entree,
    },
    dimensionsFournies,
  };
}
