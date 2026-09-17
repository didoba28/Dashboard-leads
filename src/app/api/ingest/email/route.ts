import { erreur, gererErreur, ok, verifierJetonIngestion } from '@/lib/api/http';
import { creerLead } from '@/lib/db/leads';
import { schemaLeadInput } from '@/lib/domain/lead';
import { leadDepuisEmail, schemaEmailEntrant } from '@/lib/ingest/email';

export const dynamic = 'force-dynamic';

const MAX_LOT = 50;

export async function POST(request: Request) {
  try {
    const erreurJeton = verifierJetonIngestion(request);
    if (erreurJeton) return erreur(erreurJeton, 401);

    const body: unknown = await request.json();
    const estLot = Boolean(body && typeof body === 'object' && 'emails' in body);

    if (estLot) {
      const emails = (body as { emails: unknown }).emails;
      if (!Array.isArray(emails)) {
        return erreur('« emails » doit être un tableau.', 422);
      }
      if (emails.length > MAX_LOT) {
        return erreur(`Lot trop volumineux (maximum ${MAX_LOT} e-mails).`, 422);
      }

      let crees = 0;
      let doublons = 0;
      const erreurs: Array<{ index: number; message: string }> = [];

      for (const [index, brut] of emails.entries()) {
        try {
          const entree = schemaEmailEntrant.parse(brut);
          const parsed = schemaLeadInput.parse(leadDepuisEmail(entree));
          const { doublon } = creerLead(parsed, { dedupliquer: true });
          if (doublon) doublons++;
          else crees++;
        } catch (err) {
          erreurs.push({ index, message: err instanceof Error ? err.message : String(err) });
        }
      }

      return ok({ traites: emails.length, crees, doublons, erreurs });
    }

    const entree = schemaEmailEntrant.parse(body);
    const parsed = schemaLeadInput.parse(leadDepuisEmail(entree));
    const { lead, doublon } = creerLead(parsed, { dedupliquer: true });
    return ok({ cree: !doublon, doublon, lead }, { status: doublon ? 200 : 201 });
  } catch (err) {
    return gererErreur(err);
  }
}
