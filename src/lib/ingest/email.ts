/**
 * Ingestion des e-mails de notification de formulaire : validation de l'entrée,
 * conversion HTML → texte et construction d'un lead à partir d'un e-mail.
 */
import { z } from 'zod';
import { classifier, SEUIL_CONFIANCE } from '@/lib/domain/classify';
import { aujourdHui, type LeadInput } from '@/lib/domain/lead';

/** Schéma d'un e-mail entrant (webhook de service de mail entrant type SendGrid/Mailgun). */
export const schemaEmailEntrant = z
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
