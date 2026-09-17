import { erreur, gererErreur, ok } from '@/lib/api/http';
import { creerLead } from '@/lib/db/leads';
import { schemaLeadInput } from '@/lib/domain/lead';
import {
  evenementSlackExploitable,
  leadDepuisMessageSlack,
  verifierSignatureSlack,
  type EvenementSlackMessage,
} from '@/lib/ingest/slack';

export const dynamic = 'force-dynamic';

interface EvenementCallback {
  type: 'event_callback';
  event: EvenementSlackMessage;
}

interface UrlVerification {
  type: 'url_verification';
  challenge: string;
}

type PayloadSlack = UrlVerification | EvenementCallback | { type: string };

export async function POST(request: Request) {
  try {
    // Le corps BRUT est indispensable à la vérification de signature Slack.
    const corpsBrut = await request.text();
    const erreurSignature = verifierSignatureSlack({
      corpsBrut,
      timestamp: request.headers.get('x-slack-request-timestamp'),
      signature: request.headers.get('x-slack-signature'),
      secret: process.env.SLACK_SIGNING_SECRET,
    });
    // Une requête mal signée est rejetée avec un 401, pas une erreur serveur.
    if (erreurSignature) return erreur(erreurSignature, 401);

    const payload = JSON.parse(corpsBrut) as PayloadSlack;

    // Slack exige la confirmation du challenge lors de la configuration de l'URL d'événements.
    if (payload.type === 'url_verification') {
      return ok({ challenge: (payload as UrlVerification).challenge });
    }

    if (payload.type !== 'event_callback') {
      return ok({ ignore: true, raison: `type d'événement non géré : ${payload.type}` });
    }

    const { event } = payload as EvenementCallback;
    const retry = request.headers.get('x-slack-retry-num') !== null;

    if (!evenementSlackExploitable(event)) {
      return ok({ ignore: true, raison: 'message non exploitable (subtype ignoré ou hors sujet)', retry });
    }

    const lead = leadDepuisMessageSlack({
      texte: event.text ?? '',
      blocs: event.blocks,
      ts: event.ts ?? String(Date.now() / 1000),
      canal: event.channel ?? 'inconnu',
    });

    const parsed = schemaLeadInput.parse(lead);
    const { lead: leadCree, doublon } = creerLead(parsed, { dedupliquer: true });

    return ok({ cree: !doublon, doublon, lead: leadCree, retry });
  } catch (err) {
    return gererErreur(err);
  }
}
