/**
 * Ingestion des messages Slack (#inbound) : vérification de signature,
 * nettoyage du balisage Slack et construction d'un lead à partir d'un message.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { classifier, SEUIL_CONFIANCE } from '@/lib/domain/classify';
import type { LeadInput } from '@/lib/domain/lead';
import { texteDepuisBlocsSlack } from './slack-content';

export { texteDepuisBlocsSlack } from './slack-content';

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
  attachments?: unknown;
  username?: string;
  bot_profile?: { name?: string };
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
  evenement?: unknown;
  ts: string;
  canal: string;
}

interface IdentiteNotificationSlack {
  nom: string | null;
  ville: string | null;
}

/**
 * Lit les formats publiés dans #inbound par les automatisations AirFit :
 * format compact, titre puis ligne `NOM — VILLE`, et phrase du bot livre blanc.
 *
 * Ce format ne contient pas les habituelles lignes `Nom : ...` / `Ville : ...`,
 * donc le classifieur générique ne peut pas les reconnaître tout seul.
 */
export function extraireIdentiteNotificationSlack(texte: string): IdentiteNotificationSlack {
  const lignes = texte
    .split(/\r?\n/)
    .map((valeur) => valeur.trim())
    .filter(Boolean);

  const nettoyerMarkdown = (valeur: string) => valeur.replace(/[*_`]/g, '').trim();
  const nettoyerVille = (valeur: string) => valeur
    .replace(/[.!;]+\s*$/u, '')
    .replace(/(?:\s+|^)\d{4,5}\s*$/u, '')
    .trim()
    .replace(/\s+/g, ' ');

  const ligneCompacte = lignes
    .map(nettoyerMarkdown)
    .find((valeur) => /^nouveau\s+(?:lead|contact)\s+airfit\s*:/i.test(valeur));

  if (ligneCompacte) {
    // Tout ce qui suit les deux-points appartient au nom. On conserve notamment
    // les particules (« de Cuniac »), impossibles à distinguer d'une préposition.
    const contenu = ligneCompacte.replace(/^nouveau\s+(?:lead|contact)\s+airfit\s*:\s*/i, '').trim();
    const avecLocalisation = /^(.+?)\s*\(([^()]*)\)\s*[.!]?$/u.exec(contenu);
    const nom = (avecLocalisation?.[1] ?? contenu).trim().replace(/\s+/g, ' ');
    const ville = nettoyerVille(avecLocalisation?.[2]?.trim() ?? '');

    return {
      nom: nom && nom.length <= 120 ? nom : null,
      ville: ville && ville.length <= 120 ? ville : null,
    };
  }

  const lignesNettoyees = lignes.map(nettoyerMarkdown);
  const indexTitre = lignesNettoyees.findIndex((ligne) =>
    /^nouveau\s+(?:lead|contact)\s+airfit\s*[.!]?$/i.test(ligne),
  );
  if (indexTitre >= 0) {
    const identite = lignesNettoyees.slice(indexTitre + 1).find((ligne) => /\s[—–]\s/u.test(ligne));
    const morceaux = identite ? /^(.+?)\s+[—–]\s+(.+)$/u.exec(identite) : null;
    const nom = morceaux?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
    const ville = nettoyerVille(morceaux?.[2] ?? '');
    if (nom) {
      return {
        nom: nom.length <= 120 ? nom : null,
        ville: ville && ville.length <= 120 ? ville : null,
      };
    }
  }

  const phraseLivreBlanc = lignesNettoyees
    .map((ligne) => /^nouveau\s+lead\s+entrant\s*:\s*(.+?)\s+de\s+la\s+ville\s+de\s+(.+?)\s+vient\s+de\s+t[ée]l[ée]charger\b/iu.exec(ligne))
    .find((resultat) => resultat != null);
  if (phraseLivreBlanc) {
    const nom = phraseLivreBlanc[1]!.trim().replace(/\s+/g, ' ');
    const ville = nettoyerVille(phraseLivreBlanc[2]!);
    return {
      nom: nom.length <= 120 ? nom : null,
      ville: ville && ville.length <= 120 ? ville : null,
    };
  }

  return { nom: null, ville: null };
}

const champTexteMake = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((valeur) => {
    if (valeur == null) return null;
    const texte = String(valeur).trim();
    return texte || null;
  });

const schemaPayloadSlackMake = z
  .object({
    texte: champTexteMake,
    text: champTexteMake,
    message: champTexteMake,
    body: champTexteMake,
    corpsTexte: champTexteMake,
    sujet: champTexteMake,
    subject: champTexteMake,
    origine: champTexteMake,
    origin: champTexteMake,
    sourceLead: champTexteMake,
    leadSource: champTexteMake,
    typeDemande: champTexteMake,
    leadMagnet: champTexteMake,
    botName: champTexteMake,
    botId: champTexteMake,
    bot_id: champTexteMake,
    appName: champTexteMake,
    formName: champTexteMake,
    formulaire: champTexteMake,
    username: champTexteMake,
    channel: champTexteMake,
    channelId: champTexteMake,
    ts: champTexteMake,
    timestamp: champTexteMake,
    receivedAt: champTexteMake,
    recuLe: champTexteMake,
    messageId: champTexteMake,
    blocks: z.unknown().optional(),
    blocs: z.unknown().optional(),
    attachments: z.unknown().optional(),
    piecesJointes: z.unknown().optional(),
    blocksText: champTexteMake,
    blockText1: champTexteMake,
    blockText2: champTexteMake,
    blockText3: champTexteMake,
    blockText4: champTexteMake,
    blockText5: champTexteMake,
    blockText6: champTexteMake,
    blockText7: champTexteMake,
    blockText8: champTexteMake,
    attachmentTitles: champTexteMake,
    attachmentValues: champTexteMake,
    attachmentFallback: champTexteMake,
    event: z
      .object({
        text: champTexteMake,
        channel: champTexteMake,
        ts: champTexteMake,
        blocks: z.unknown().optional(),
        attachments: z.unknown().optional(),
        username: champTexteMake,
        bot_profile: z.object({ name: champTexteMake }).passthrough().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()
  .refine(
    (payload) =>
      Boolean(
        payload.texte ??
          payload.text ??
          payload.message ??
          payload.body ??
          payload.corpsTexte ??
          payload.sujet ??
          payload.subject ??
          payload.event?.text ??
          payload.blocks ??
          payload.blocs ??
          payload.attachments ??
          payload.piecesJointes ??
          payload.blocksText ??
          payload.blockText1 ??
          payload.blockText2 ??
          payload.blockText3 ??
          payload.blockText4 ??
          payload.blockText5 ??
          payload.blockText6 ??
          payload.blockText7 ??
          payload.blockText8 ??
          payload.attachmentValues ??
          payload.attachmentFallback ??
          payload.event?.blocks ??
          payload.event?.attachments,
      ),
    { path: ['text'], message: 'Un champ text, message, body ou corpsTexte est requis.' },
  );

function timestampSlack(valeur: string | null): string {
  if (!valeur) return String(Math.floor(Date.now() / 1000));
  const nombre = Number(valeur);
  if (Number.isFinite(nombre)) {
    return nombre > 10_000_000_000 ? String(Math.floor(nombre / 1000)) : valeur;
  }
  const millisecondes = Date.parse(valeur);
  return Number.isNaN(millisecondes)
    ? String(Math.floor(Date.now() / 1000))
    : String(Math.floor(millisecondes / 1000));
}

/** Normalise les sorties variables du module Slack de Make. */
export function parametresDepuisPayloadSlackMake(payloadBrut: unknown): ParamsLeadDepuisMessageSlack {
  const payload = schemaPayloadSlackMake.parse(payloadBrut);
  const contenu =
    payload.texte ??
    payload.text ??
    payload.message ??
    payload.body ??
    payload.corpsTexte ??
    payload.event?.text ??
    '';
  const sujet = payload.sujet ?? payload.subject;
  const titresPiecesJointes = payload.attachmentTitles?.split(/\r?\n/).map((valeur) => valeur.trim()) ?? [];
  const valeursPiecesJointes = payload.attachmentValues?.split(/\r?\n/).map((valeur) => valeur.trim()) ?? [];
  const champsPiecesJointes = titresPiecesJointes
    .map((titre, index) => {
      const valeur = valeursPiecesJointes[index];
      return titre && valeur ? `${titre.replace(/:\s*$/, '')}: ${valeur}` : valeur || titre;
    })
    .filter((valeur): valeur is string => Boolean(valeur));
  const champsBlocsAplatis = [
    payload.blockText1,
    payload.blockText2,
    payload.blockText3,
    payload.blockText4,
    payload.blockText5,
    payload.blockText6,
    payload.blockText7,
    payload.blockText8,
  ].filter((valeur): valeur is string => Boolean(valeur));
  const botId = payload.botId ?? payload.bot_id;
  const nomBotConnu = botId === 'B0BFB6LGWN4' ? 'Leads simulateur' : null;
  const origine =
    payload.origine ??
    payload.origin ??
    payload.sourceLead ??
    payload.leadSource ??
    payload.typeDemande ??
    payload.leadMagnet ??
    payload.formName ??
    payload.formulaire ??
    payload.botName ??
    nomBotConnu ??
    payload.appName ??
    payload.username ??
    payload.event?.bot_profile?.name ??
    payload.event?.username;
  const texte = [
    sujet && !contenu.includes(sujet) ? sujet : null,
    contenu || null,
    payload.blocksText,
    ...champsBlocsAplatis,
    payload.attachmentFallback,
    ...champsPiecesJointes,
    origine ? `Origine : ${origine}` : null,
  ].filter((valeur): valeur is string => Boolean(valeur)).join('\n');

  return {
    texte,
    blocs: [
      payload.blocks ?? payload.blocs ?? payload.event?.blocks,
      payload.attachments ?? payload.piecesJointes ?? payload.event?.attachments,
    ].filter((valeur) => valeur != null),
    evenement: payloadBrut,
    ts: timestampSlack(
      payload.ts ?? payload.timestamp ?? payload.receivedAt ?? payload.recuLe ?? payload.messageId ?? payload.event?.ts ?? null,
    ),
    canal: payload.channel ?? payload.channelId ?? payload.event?.channel ?? 'make',
  };
}

/** Construit un lead (au format `schemaLeadInput`) à partir d'un message Slack. */
export function leadDepuisMessageSlack(params: ParamsLeadDepuisMessageSlack): LeadInput {
  const texteBlocs = texteDepuisBlocsSlack(params.blocs);
  const lignesTitre = new Set(params.texte.split(/\r?\n/).map((ligne) => ligne.trim()).filter(Boolean));
  const lignesBlocs = texteBlocs.split(/\r?\n/).map((ligne) => ligne.trim()).filter((ligne) => ligne && !lignesTitre.has(ligne));
  const texteNettoye = nettoyerTexteSlack([params.texte, ...lignesBlocs].filter(Boolean).join('\n'));
  const url = extraireUrlSlack(texteNettoye);
  const resultat = classifier({ corps: texteNettoye, url });
  const identiteCompacte = extraireIdentiteNotificationSlack(texteNettoye);
  const bonusIdentite =
    (!resultat.nom && identiteCompacte.nom ? 0.125 : 0) +
    (!resultat.ville && identiteCompacte.ville ? 0.125 : 0);
  const adresseInterneIgnoree = resultat.indices.includes('adresse interne @airfit.co ignorée');
  const confiance = adresseInterneIgnoree
    ? Math.min(0.59, resultat.confiance)
    : Math.min(1, Math.round((resultat.confiance + bonusIdentite) * 100) / 100);

  // `ts` Slack : secondes epoch (éventuellement suffixées `.000000`).
  const secondes = Number(params.ts.split('.')[0]);
  const dateReception = Number.isFinite(secondes)
    ? new Date(secondes * 1000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return {
    dateReception,
    nom: resultat.nom ?? identiteCompacte.nom,
    email: resultat.email,
    telephone: resultat.telephone,
    societe: resultat.societe,
    ville: resultat.ville ?? identiteCompacte.ville,
    // Règle métier AirFit : le canal Slack #inbound est réservé aux demandes
    // de collectivités. Le contenu reste utilisé pour tous les autres champs.
    segment: 'collectivite',
    relation: resultat.relation,
    typeDemande: resultat.typeDemande,
    initiative: resultat.initiative,
    sourceCollecte: 'slack_inbound',
    campagne: resultat.campagne,
    leadMagnet: resultat.leadMagnet,
    message: texteNettoye.slice(0, LONGUEUR_MAX_MESSAGE),
    aVerifier: confiance < SEUIL_CONFIANCE,
    confiance,
    rawPayload: { source: 'slack', canal: params.canal, ts: params.ts, texte: params.texte, blocs: params.blocs ?? null, evenement: params.evenement ?? null },
  };
}
