import { erreur, gererErreur, ok, verifierJetonIngestion } from '@/lib/api/http';
import { creerLead } from '@/lib/db/leads';
import { schemaLeadInput } from '@/lib/domain/lead';
import { leadDepuisFormulaire, schemaFormulaire } from '@/lib/ingest/formulaire';

export const dynamic = 'force-dynamic';

const MAX_LOT = 100;

export async function POST(request: Request) {
  try {
    const erreurJeton = verifierJetonIngestion(request);
    if (erreurJeton) return erreur(erreurJeton, 401);

    const body: unknown = await request.json();
    const estLot = Boolean(body && typeof body === 'object' && 'leads' in body);

    if (estLot) {
      const leads = (body as { leads: unknown }).leads;
      if (!Array.isArray(leads)) {
        return erreur('« leads » doit être un tableau.', 422);
      }
      if (leads.length > MAX_LOT) {
        return erreur(`Lot trop volumineux (maximum ${MAX_LOT} leads).`, 422);
      }

      let crees = 0;
      let doublons = 0;
      const erreurs: Array<{ index: number; message: string }> = [];

      for (const [index, brut] of leads.entries()) {
        try {
          const entree = schemaFormulaire.parse(brut);
          const resultat = leadDepuisFormulaire(entree);
          const parsed = schemaLeadInput.parse(resultat);
          const { doublon } = await creerLead(parsed, { dedupliquer: true });
          if (doublon) doublons++;
          else crees++;
        } catch (err) {
          erreurs.push({ index, message: err instanceof Error ? err.message : String(err) });
        }
      }

      return ok({ traites: leads.length, crees, doublons, erreurs });
    }

    const entree = schemaFormulaire.parse(body);
    const resultat = leadDepuisFormulaire(entree);
    const parsed = schemaLeadInput.parse(resultat);
    const { lead, doublon } = await creerLead(parsed, { dedupliquer: true });

    return ok(
      { cree: !doublon, doublon, lead, dimensionsFournies: resultat.dimensionsFournies },
      { status: doublon ? 200 : 201 },
    );
  } catch (err) {
    return gererErreur(err);
  }
}
