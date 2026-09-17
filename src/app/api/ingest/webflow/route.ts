import { erreur, gererErreur, ok, verifierJetonIngestion } from '@/lib/api/http';
import { creerLead } from '@/lib/db/leads';
import { schemaLeadInput } from '@/lib/domain/lead';
import { leadDepuisWebflow, schemaWebflow, verifierSignatureWebflow } from '@/lib/ingest/webflow';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === 'production' && !process.env.WEBFLOW_WEBHOOK_SECRET) {
      return erreur('Signature Webflow non configurée.', 503);
    }
    // Le corps BRUT est indispensable à la vérification de signature Webflow.
    const corpsBrut = await request.text();
    const erreurSignature = verifierSignatureWebflow({
      corpsBrut,
      timestamp: request.headers.get('x-webflow-timestamp'),
      signature: request.headers.get('x-webflow-signature'),
      secret: process.env.WEBFLOW_WEBHOOK_SECRET,
    });
    if (erreurSignature) return erreur(erreurSignature, 401);

    // En local, un webhook sans signature garde l'ancien jeton de test.
    // En production, la signature vérifiée suffit et aucun secret ne figure dans l'URL.
    if (!process.env.WEBFLOW_WEBHOOK_SECRET) {
      const erreurJeton = verifierJetonIngestion(request);
      if (erreurJeton) return erreur(erreurJeton, 401);
    }

    const payload: unknown = JSON.parse(corpsBrut);
    const entree = schemaWebflow.parse(payload);
    const parsed = schemaLeadInput.parse(leadDepuisWebflow(entree));
    const { lead, doublon } = await creerLead(parsed, { dedupliquer: true });

    return ok({ cree: !doublon, doublon, lead }, { status: doublon ? 200 : 201 });
  } catch (err) {
    return gererErreur(err);
  }
}
