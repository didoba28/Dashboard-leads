/**
 * Ingestion des e-mails de notification de formulaire : validation de l'entrée,
 * conversion HTML → texte et construction d'un lead à partir d'un e-mail.
 */
import { z } from 'zod';
import { classifier, SEUIL_CONFIANCE } from '@/lib/domain/classify';
import { aujourdHui, type LeadInput } from '@/lib/domain/lead';
import { extraireDetailsFormulaireEmail } from './email-details';

/** Schéma d'un e-mail entrant (webhook de service de mail entrant type SendGrid/Mailgun). */
const schemaEmailBrut = z
  .object({
    sujet: z.string().trim().nullable().optional(),
    expediteur: z.string().trim().nullable().optional(),
    destinataire: z.string().trim().nullable().optional(),
    corpsTexte: z.string().nullable().optional(),
    corpsHtml: z.string().nullable().optional(),
    url: z.string().trim().nullable().optional(),
    recuLe: z.string().trim().nullable().optional(),
    messageId: z.string().trim().nullable().optional(),
    // Alias envoyés par Gmail / Make.
    subject: z.string().trim().nullable().optional(),
    fromEmail: z.string().trim().nullable().optional(),
    fromName: z.string().trim().nullable().optional(),
    to: z.string().trim().nullable().optional(),
    body: z.string().nullable().optional(),
    text: z.string().nullable().optional(),
    fullTextBody: z.string().nullable().optional(),
    html: z.string().nullable().optional(),
    htmlBody: z.string().nullable().optional(),
    receivedAt: z.string().trim().nullable().optional(),
    internalDate: z.string().trim().nullable().optional(),
    id: z.string().trim().nullable().optional(),
  })
  .passthrough();

function premierTexte(...valeurs: Array<string | null | undefined>): string | null {
  return valeurs.find((valeur) => Boolean(valeur?.trim()))?.trim() ?? null;
}

export const schemaEmailEntrant = schemaEmailBrut
  .transform((v) => {
    const emailExpediteur = premierTexte(v.expediteur, v.fromEmail);
    const expediteur = v.expediteur
      ? v.expediteur
      : v.fromName && emailExpediteur
        ? `${v.fromName} <${emailExpediteur}>`
        : premierTexte(v.fromName, emailExpediteur);

    return {
      ...v,
      sujet: premierTexte(v.sujet, v.subject),
      expediteur,
      destinataire: premierTexte(v.destinataire, v.to),
      corpsTexte: premierTexte(v.corpsTexte, v.fullTextBody, v.text, v.body),
      corpsHtml: premierTexte(v.corpsHtml, v.htmlBody, v.html),
      recuLe: premierTexte(v.recuLe, v.receivedAt, v.internalDate),
      messageId: premierTexte(v.messageId, v.id),
    };
  })
  .refine(
    (v) => Boolean(v.corpsTexte?.trim()) || Boolean(v.corpsHtml?.trim()) || Boolean(v.sujet?.trim()),
    { message: 'Au moins un des champs sujet, corpsTexte ou corpsHtml doit être renseigné.' },
  );

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
  const timestamp = /^\d{10,13}$/.test(recuLe)
    ? Number(recuLe) * (recuLe.length === 10 ? 1000 : 1)
    : recuLe;
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? aujourdHui() : d.toISOString().slice(0, 10);
}

/** Construit un lead (au format `schemaLeadInput`) à partir d'un e-mail entrant. */
export function leadDepuisEmail(entree: EmailEntrant): LeadInput {
  const corps = entree.corpsTexte?.trim() || (entree.corpsHtml ? htmlVersTexte(entree.corpsHtml) : '');
  const details = extraireDetailsFormulaireEmail(corps);
  const resultat = classifier({
    sujet: entree.sujet ?? null,
    expediteur: entree.expediteur ?? null,
    corps,
    url: entree.url ?? null,
  });

  return {
    dateReception: dateDepuisRecuLe(entree.recuLe),
    nom: details?.prenom && details.nom
      ? `${details.prenom} ${details.nom}`
      : details?.nom ?? resultat.nom,
    email: details?.email ?? resultat.email,
    telephone: details?.telephone ?? resultat.telephone,
    societe: resultat.societe,
    ville: details?.ville ?? resultat.ville,
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
      detailsFormulaire: details,
      donnees: entree,
    },
  };
}
