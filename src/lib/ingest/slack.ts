/**
 * Ingestion des messages Slack (#inbound) : vérification de signature,
 * nettoyage du balisage Slack et construction d'un lead à partir d'un message.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { classifier, SEUIL_CONFIANCE } from '@/lib/domain/classify';
import type { LeadInput } from '@/lib/domain/lead';

/** Fenêtre de tolérance sur l'horodatage de la requête (anti-rejeu). */
const FENETRE_REJEU_SECONDES = 5 * 60;

export interface ParamsVerificationSignature {
  /** Corps brut exact de la requête (avant tout `JSON.parse`). */
  corpsBrut: string;
  timestamp: string | null;
  signature: string | null;
  /** Signing secret Slack (`SLACK_SIGNING_SECRET`). */
  secret: string | undefined;
  /** Horodatage courant en secondes epoch, injectable pour les tests. */
  maintenant?: number;
}

/**
 * Vérifie la signature Slack (schéma officiel `v0`).
 * Renvoie `null` si la requête est valide, sinon un message d'erreur explicite.
 */
export function verifierSignatureSlack(params: ParamsVerificationSignature): string | null {
  const { corpsBrut, timestamp, signature, secret } = params;
  // Un endpoint sans secret configuré doit rester fermé : jamais de requête non signée acceptée.
  if (!secret) return "SLACK_SIGNING_SECRET n'est pas configuré : l'ingestion Slack est désactivée.";
  if (!timestamp) return 'En-tête X-Slack-Request-Timestamp manquant.';
  if (!signature) return 'En-tête X-Slack-Signature manquant.';

  const maintenant = params.maintenant ?? Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return 'Horodatage Slack invalide.';
  if (Math.abs(maintenant - ts) > FENETRE_REJEU_SECONDES) {
    return 'Horodatage Slack trop ancien (risque de rejeu).';
  }

  const base = `v0:${timestamp}:${corpsBrut}`;
  const signatureAttendue = `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;

  const bufAttendu = Buffer.from(signatureAttendue, 'utf8');
  const bufFourni = Buffer.from(signature, 'utf8');
  if (bufAttendu.length !== bufFourni.length || !timingSafeEqual(bufAttendu, bufFourni)) {
    return 'Signature Slack invalide.';
  }
  return null;
}

/** Retire le balisage Slack (`<mailto:...>`, `<url|libellé>`, `<@U123>`, entités HTML). */
export function nettoyerTexteSlack(texte: string): string {
  return texte
    .replace(/<mailto:([^|>]+)\|[^>]+>/g, '$1')
    .replace(/<mailto:([^>]+)>/g, '$1')
    .replace(/<([^|>]+)\|([^>]+)>/g, (_m, url: string, libelle: string) =>
      /^https?:\/\//.test(url) ? url : libelle,
    )
    .replace(/<https?:\/\/[^>]+>/g, (m) => m.slice(1, -1))
    .replace(/<@[UW][A-Z0-9]+>/g, '')
    .replace(/<#[C][A-Z0-9]+\|?([^>]*)>/g, (_m, nomCanal: string) => (nomCanal ? `#${nomCanal}` : ''))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** Première URL http(s) trouvée dans le texte (pour lire les UTM éventuels). */
export function extraireUrlSlack(texte: string): string | null {
  const m = /https?:\/\/[^\s<>|]+/.exec(texte);
  return m ? m[0] : null;
}

const SUBTYPES_IGNORES = new Set([
  'bot_message',
  'message_changed',
  'message_deleted',
  'channel_join',
  'channel_leave',
]);

export interface EvenementSlackMessage {
  type?: string;
  subtype?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  channel?: string;
  blocks?: unknown;
}

/**
 * Un message Slack est exploitable s'il s'agit d'un vrai message (pas d'édition,
 * suppression ou mouvement de canal). Les messages d'app (bot_id) sont acceptés :
 * les formulaires arrivent souvent via un bot d'intégration.
 */
export function evenementSlackExploitable(evenement: EvenementSlackMessage): boolean {
  if (evenement.type !== 'message') return false;
  if (evenement.subtype && SUBTYPES_IGNORES.has(evenement.subtype)) return false;
  return true;
}

const LONGUEUR_MAX_MESSAGE = 5000;

export interface ParamsLeadDepuisMessageSlack {
  texte: string;
  blocs?: unknown;
  ts: string;
  canal: string;
}

/** Construit un lead (au format `schemaLeadInput`) à partir d'un message Slack. */
export function leadDepuisMessageSlack(params: ParamsLeadDepuisMessageSlack): LeadInput {
  const texteNettoye = nettoyerTexteSlack(params.texte);
  const url = extraireUrlSlack(texteNettoye);
  const resultat = classifier({ corps: texteNettoye, url });

  // `ts` Slack : secondes epoch (éventuellement suffixées `.000000`).
  const secondes = Number(params.ts.split('.')[0]);
  const dateReception = Number.isFinite(secondes)
    ? new Date(secondes * 1000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return {
    dateReception,
    nom: resultat.nom,
    email: resultat.email,
    telephone: resultat.telephone,
    societe: resultat.societe,
    ville: resultat.ville,
    segment: resultat.segment,
    relation: resultat.relation,
    typeDemande: resultat.typeDemande,
    initiative: resultat.initiative,
    sourceCollecte: 'slack_inbound',
    campagne: resultat.campagne,
    leadMagnet: resultat.leadMagnet,
    message: texteNettoye.slice(0, LONGUEUR_MAX_MESSAGE),
    aVerifier: resultat.confiance < SEUIL_CONFIANCE,
    confiance: resultat.confiance,
    rawPayload: { source: 'slack', canal: params.canal, ts: params.ts, texte: params.texte },
  };
}
