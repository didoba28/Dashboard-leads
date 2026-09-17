/**
 * Ingestion des webhooks natifs Webflow (formulaires) : Webflow expose deux formats
 * selon l'ancienneté du site (v2 « payload » actuel, v1 « legacy » encore vu sur les
 * sites plus anciens) — on accepte les deux et on les ramène à une forme unique.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { classifier, normaliserTexte, SEUIL_CONFIANCE } from '@/lib/domain/classify';
import { aujourdHui, type LeadInput } from '@/lib/domain/lead';

/** Fenêtre de tolérance sur l'horodatage de la requête (anti-rejeu), en millisecondes. */
const FENETRE_REJEU_MS = 5 * 60 * 1000;

export interface ParamsVerificationSignatureWebflow {
  /** Corps brut exact de la requête (avant tout `JSON.parse`). */
  corpsBrut: string;
  timestamp: string | null;
  signature: string | null;
  /** Secret configuré côté Webflow (`WEBFLOW_WEBHOOK_SECRET`). */
  secret: string | undefined;
  /** Horodatage courant en millisecondes epoch, injectable pour les tests. */
  maintenant?: number;
}

/**
 * Vérifie la signature d'un webhook Webflow (HMAC-SHA256 hex de `${timestamp}:${corps}`).
 * Renvoie `null` si la requête est valide, sinon un message d'erreur explicite.
 *
 * Si `secret` est absent, la vérification est ignorée pour préserver le
 * développement local. La route bloque ce cas en production : la signature
 * et le jeton d'ingestion y sont tous deux requis.
 */
export function verifierSignatureWebflow(params: ParamsVerificationSignatureWebflow): string | null {
  const { corpsBrut, timestamp, signature, secret } = params;
  if (!secret) return null;
  if (!timestamp) return 'En-tête x-webflow-timestamp manquant.';
  if (!signature) return 'En-tête x-webflow-signature manquant.';

  const maintenant = params.maintenant ?? Date.now();
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return 'Horodatage Webflow invalide.';
  if (Math.abs(maintenant - ts) > FENETRE_REJEU_MS) {
    return 'Horodatage Webflow trop ancien (risque de rejeu).';
  }

  const base = `${timestamp}:${corpsBrut}`;
  const signatureAttendue = createHmac('sha256', secret).update(base).digest('hex');

  const bufAttendu = Buffer.from(signatureAttendue, 'utf8');
  const bufFourni = Buffer.from(signature, 'utf8');
  if (bufAttendu.length !== bufFourni.length || !timingSafeEqual(bufAttendu, bufFourni)) {
    return 'Signature Webflow invalide.';
  }
  return null;
}

// --- Normalisation du payload (v1 legacy vs v2 actuel) ------------------------

const valeurChampBrute = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

const dataBrute = z.record(z.string(), valeurChampBrute);

const schemaV2 = z.object({
  triggerType: z.string().optional(),
  payload: z.object({
    name: z.string(),
    siteId: z.string().nullable().optional(),
    formId: z.string().nullable().optional(),
    submittedAt: z.string().nullable().optional(),
    data: dataBrute,
  }),
});

const schemaV1 = z.object({
  name: z.string(),
  site: z.string().nullable().optional(),
  d: z.string().nullable().optional(),
  data: dataBrute,
});

/** Une valeur de champ Webflow (texte, nombre, case à cocher, ou tableau de cases) → chaîne. */
function normaliserValeurChamp(valeur: z.infer<typeof valeurChampBrute>): string {
  if (Array.isArray(valeur)) return valeur.map((v) => String(v)).join(', ');
  return String(valeur);
}

export interface EntreeWebflowNormalisee {
  nomFormulaire: string;
  /** Champs du formulaire, clé Webflow (telle que saisie dans le Designer) → valeur en chaîne. */
  data: Record<string, string>;
  soumisLe: string | null;
  siteId: string | null;
  formId: string | null;
}

/** Accepte les formats v1 (legacy) et v2 (`payload`) et les ramène à une forme unique. */
export const schemaWebflow = z
  .union([schemaV2, schemaV1])
  .transform((v, ctx): EntreeWebflowNormalisee => {
    const estV2 = 'payload' in v;
    const nomFormulaire = estV2 ? v.payload.name : v.name;
    const dataSource = estV2 ? v.payload.data : v.data;
    const soumisLe = (estV2 ? v.payload.submittedAt : v.d) ?? null;
    const siteId = (estV2 ? v.payload.siteId : v.site) ?? null;
    const formId = (estV2 ? v.payload.formId : null) ?? null;

    const data: Record<string, string> = {};
    for (const [cle, valeur] of Object.entries(dataSource)) {
      data[cle] = normaliserValeurChamp(valeur);
    }

    if (Object.keys(data).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La soumission Webflow ne contient aucun champ de formulaire.',
      });
      return z.NEVER;
    }

    return { nomFormulaire, data, soumisLe, siteId, formId };
  });

// --- Reconnaissance tolérante des clés de `data` -------------------------------

const CLES_EMAIL = ['email', 'e_mail', 'mail', 'adresse_email', 'courriel'];
const CLES_NOM = ['nom', 'name', 'nom_complet', 'nom_et_prenom', 'votre_nom'];
const CLES_PRENOM = ['prenom', 'first_name'];
const CLES_TELEPHONE = ['telephone', 'tel', 'phone', 'mobile', 'portable'];
const CLES_SOCIETE = [
  'societe', 'entreprise', 'organisme', 'organisation', 'collectivite', 'structure', 'company', 'mairie',
  'commune',
];
const CLES_FONCTION = ['fonction', 'poste', 'role', 'job_title'];
const CLES_VILLE = ['ville', 'commune', 'city', 'localite'];
const CLES_MESSAGE = [
  'message', 'demande', 'commentaire', 'precisions', 'precisions_sur_votre_projet_optionnel', 'besoin',
];

/** Clé de champ Webflow → forme comparable aux listes ci-dessus (`Adresse e-mail` → `adresse_e_mail`). */
function cleComparable(cle: string): string {
  return normaliserTexte(cle).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Renvoie la première valeur de `data` dont la clé (normalisée) correspond à `cles`. */
function champParClesTolerantes(data: Record<string, string>, cles: string[]): string | null {
  const index = new Map<string, string>();
  for (const [cle, valeur] of Object.entries(data)) {
    const comparable = cleComparable(cle);
    if (!index.has(comparable)) index.set(comparable, valeur);
  }
  for (const cle of cles) {
    const v = index.get(cle);
    if (v) return v;
  }
  return null;
}

const LONGUEUR_MAX_MESSAGE = 5000;

function dateDepuisSoumission(soumisLe: string | null): string {
  if (!soumisLe) return aujourdHui();
  const d = new Date(soumisLe);
  return Number.isNaN(d.getTime()) ? aujourdHui() : d.toISOString().slice(0, 10);
}

/** Construit un lead (au format `schemaLeadInput`) à partir d'une soumission Webflow normalisée. */
export function leadDepuisWebflow(entree: EntreeWebflowNormalisee): LeadInput {
  // Texte analysable pour le classifieur : nom du formulaire + une ligne `Clé : valeur` par champ.
  const lignes = Object.entries(entree.data).map(([cle, valeur]) => `${cle} : ${valeur}`);
  const texteReconstitue = [entree.nomFormulaire, ...lignes].join('\n');
  const resultat = classifier({ sujet: entree.nomFormulaire, corps: texteReconstitue });

  const emailChamp = champParClesTolerantes(entree.data, CLES_EMAIL);
  const nomChamp = champParClesTolerantes(entree.data, CLES_NOM);
  const prenomChamp = champParClesTolerantes(entree.data, CLES_PRENOM);
  const telephoneChamp = champParClesTolerantes(entree.data, CLES_TELEPHONE);
  const societeChamp = champParClesTolerantes(entree.data, CLES_SOCIETE);
  const fonctionChamp = champParClesTolerantes(entree.data, CLES_FONCTION);
  const villeChamp = champParClesTolerantes(entree.data, CLES_VILLE);
  const messageChamp = champParClesTolerantes(entree.data, CLES_MESSAGE);

  // Les champs explicites du formulaire priment sur ce que devine le classifieur.
  let nom = nomChamp;
  if (prenomChamp) nom = nomChamp ? `${prenomChamp} ${nomChamp}` : prenomChamp;
  if (!nom) nom = resultat.nom;

  const email = (emailChamp ?? resultat.email)?.toLowerCase().trim() || null;

  return {
    dateReception: dateDepuisSoumission(entree.soumisLe),
    nom,
    email,
    telephone: telephoneChamp ?? resultat.telephone,
    societe: societeChamp ?? resultat.societe,
    fonction: fonctionChamp,
    ville: villeChamp ?? resultat.ville,
    segment: resultat.segment,
    relation: resultat.relation,
    typeDemande: resultat.typeDemande,
    initiative: resultat.initiative,
    sourceCollecte: 'site_web',
    campagne: resultat.campagne,
    leadMagnet: entree.nomFormulaire,
    message: (messageChamp ?? texteReconstitue).slice(0, LONGUEUR_MAX_MESSAGE),
    aVerifier: resultat.confiance < SEUIL_CONFIANCE,
    confiance: resultat.confiance,
    rawPayload: {
      source: 'webflow',
      nomFormulaire: entree.nomFormulaire,
      siteId: entree.siteId,
      formId: entree.formId,
      data: entree.data,
    },
  };
}
