/**
 * Ingestion des e-mails de notification de formulaire : validation de l'entrée,
 * conversion HTML → texte et construction d'un lead à partir d'un e-mail.
 */
import { z } from 'zod';
import { classifier, SEUIL_CONFIANCE } from '@/lib/domain/classify';
import { aujourdHui, type LeadInput } from '@/lib/domain/lead';

/** Schéma d'un e-mail entrant (webhook de service de mail entrant type SendGrid/Mailgun). */
/**
 * Alias acceptés pour chaque champ.
 *
 * Les plateformes d'automatisation nomment les sorties d'un module e-mail
 * comme elles l'entendent (`subject`, `text`, `html`, `from`…), et ces noms
 * changent d'un connecteur à l'autre. Refuser tout ce qui n'est pas en
 * français obligerait à renommer dans chaque scénario, et un simple écart de
 * nom renverrait un 422 difficile à diagnostiquer depuis Make. On accepte donc
 * les variantes usuelles en entrée, et on normalise ici une bonne fois.
 */
const ALIAS: Record<string, string[]> = {
  sujet: ['subject', 'objet', 'titre'],
  expediteur: ['from', 'sender', 'fromEmail', 'from_email', 'expediteurEmail'],
  destinataire: ['to', 'recipient', 'toEmail'],
  corpsTexte: ['text', 'body', 'textPlain', 'plainText', 'fullTextBody', 'textBody', 'corps'],
  corpsHtml: ['html', 'htmlBody', 'bodyHtml'],
  url: ['link', 'pageUrl', 'sourceUrl'],
  recuLe: ['receivedAt', 'date', 'internalDate', 'receivedDate', 'sentAt'],
  messageId: ['id', 'message_id', 'gmailId'],
};

/** Récupère une valeur de champ, quel que soit l'alias employé. */
function premiereValeur(brut: Record<string, unknown>, canonique: string): string | undefined {
  for (const cle of [canonique, ...(ALIAS[canonique] ?? [])]) {
    const v = brut[cle];
    if (typeof v === 'string' && v.trim() !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/**
 * Reconstitue un expéditeur lisible. Un module e-mail renvoie souvent le nom
 * et l'adresse séparément, ou une collection `{ name, address }` : le
 * classifieur, lui, attend la forme `Nom <adresse>`.
 */
function reconstruireExpediteur(brut: Record<string, unknown>): string | undefined {
  const direct = premiereValeur(brut, 'expediteur');
  const objet = brut['from'];
  if (objet && typeof objet === 'object' && !Array.isArray(objet)) {
    const o = objet as Record<string, unknown>;
    const adresse = [o['address'], o['email'], o['value']].find((v) => typeof v === 'string') as string | undefined;
    const nom = [o['name'], o['displayName']].find((v) => typeof v === 'string') as string | undefined;
    if (adresse) return nom ? `${nom} <${adresse}>` : adresse;
  }
  const nom = [brut['fromName'], brut['from_name'], brut['senderName']].find(
    (v) => typeof v === 'string' && v.trim() !== '',
  ) as string | undefined;
  if (direct && nom && !direct.includes('<')) return `${nom} <${direct}>`;
  return direct ?? nom;
}

/** Normalise une charge utile quelconque vers les noms de champs canoniques. */
function normaliserEntree(valeur: unknown): unknown {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return valeur;
  const brut = valeur as Record<string, unknown>;
  const sortie: Record<string, unknown> = { ...brut };
  for (const canonique of Object.keys(ALIAS)) {
    if (canonique === 'expediteur') continue;
    const v = premiereValeur(brut, canonique);
    if (v !== undefined) sortie[canonique] = v;
  }
  const expediteur = reconstruireExpediteur(brut);
  if (expediteur !== undefined) sortie['expediteur'] = expediteur;
  return sortie;
}

export const schemaEmailEntrant = z
  .preprocess(normaliserEntree, z
  .object({
    sujet: z.string().trim().nullable().optional(),
    expediteur: z.string().trim().nullable().optional(),
    destinataire: z.string().trim().nullable().optional(),
    corpsTexte: z.string().nullable().optional(),
    corpsHtml: z.string().nullable().optional(),
    url: z.string().trim().nullable().optional(),
    recuLe: z.string().trim().nullable().optional(),
    messageId: z.string().trim().nullable().optional(),
  })
  .passthrough()
  .refine(
    (v) => Boolean(v.corpsTexte?.trim()) || Boolean(v.corpsHtml?.trim()) || Boolean(v.sujet?.trim()),
    {
      message:
        'Au moins un des champs sujet, corpsTexte ou corpsHtml doit être renseigné ' +
        '(alias acceptés : subject, text/body, html).',
    },
  ));

export type EmailEntrant = z.infer<typeof schemaEmailEntrant>;

const BALISES_BLOC = /<\/(p|div|tr|li|h[1-6])>/gi;

/** Conversion simple et robuste HTML → texte brut (pas de dépendance externe). */
export function htmlVersTexte(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(BALISES_BLOC, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .split('\n')
    .map((ligne) => ligne.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const LONGUEUR_MAX_MESSAGE = 5000;

function dateDepuisRecuLe(recuLe: string | null | undefined): string {
  if (!recuLe) return aujourdHui();
  const m = /^\d{4}-\d{2}-\d{2}/.exec(recuLe);
  if (m) return m[0];
  // Gmail et plusieurs connecteurs datent en millisecondes depuis epoch. Sans
  // ce cas, `new Date("1791205375000")` est invalide et le lead se retrouvait
  // daté du jour de l'import — donc rattaché au mauvais trimestre.
  if (/^\d{10,14}$/.test(recuLe.trim())) {
    const n = Number(recuLe.trim());
    const d = new Date(recuLe.trim().length <= 10 ? n * 1000 : n);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(recuLe);
  return Number.isNaN(d.getTime()) ? aujourdHui() : d.toISOString().slice(0, 10);
}

/** Construit un lead (au format `schemaLeadInput`) à partir d'un e-mail entrant. */
export function leadDepuisEmail(entree: EmailEntrant): LeadInput {
  const corps = entree.corpsTexte?.trim() || (entree.corpsHtml ? htmlVersTexte(entree.corpsHtml) : '');
  const resultat = classifier({
    sujet: entree.sujet ?? null,
    expediteur: entree.expediteur ?? null,
    corps,
    url: entree.url ?? null,
  });

  return {
    dateReception: dateDepuisRecuLe(entree.recuLe),
    nom: resultat.nom,
    email: resultat.email,
    telephone: resultat.telephone,
    societe: resultat.societe,
    ville: resultat.ville,
    segment: resultat.segment,
    relation: resultat.relation,
    typeDemande: resultat.typeDemande,
    initiative: resultat.initiative,
    sourceCollecte: 'email_formulaire',
    campagne: resultat.campagne,
    leadMagnet: resultat.leadMagnet,
    message: corps.slice(0, LONGUEUR_MAX_MESSAGE),
    aVerifier: resultat.confiance < SEUIL_CONFIANCE,
    confiance: resultat.confiance,
    rawPayload: {
      source: 'email',
      sujet: entree.sujet ?? null,
      expediteur: entree.expediteur ?? null,
      messageId: entree.messageId ?? null,
      donnees: entree,
    },
  };
}
