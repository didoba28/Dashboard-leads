import { erreur, gererErreur, ok, verifierJetonIngestion } from '@/lib/api/http';
import { creerLead } from '@/lib/db/leads';
import { schemaLeadInput } from '@/lib/domain/lead';
import { leadDepuisWebflow, schemaWebflow, verifierSignatureWebflow } from '@/lib/ingest/webflow';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Le corps BRUT est indispensable à la vérification de signature Webflow.
    const corpsBrut = await request.text();
    const erreurSignature = verifierSignatureWebflow({
      corpsBrut,
      timestamp: request.headers.get('x-webflow-timestamp'),
      signature: request.headers.get('x-webflow-signature'),
      secret: process.env.WEBFLOW_WEBHOOK_SECRET,
    });
    if (erreurSignature) return erreur(erreurSignature, 401);

    // Webflow ne permet pas d'en-tête personnalisé : le jeton passe par `?token=`.
    const erreurJeton = verifierJetonIngestion(request);
    if (erreurJeton) return erreur(erreurJeton, 401);

    const payload: unknown = JSON.parse(corpsBrut);
    const entree = schemaWebflow.parse(payload);
    const parsed = schemaLeadInput.parse(leadDepuisWebflow(entree));
    const { lead, doublon } = await creerLead(parsed, { dedupliquer: true });

    return ok({ cree: !doublon, doublon, lead }, { status: doublon ? 200 : 201 });
  } catch (err) {
    return gererErreur(err);
  }
}
