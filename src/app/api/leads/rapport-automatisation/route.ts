import { evaluerValidationAutomatique } from '@/lib/domain/automation';
import { pointsProposesDuLead } from '@/lib/domain/lead';
import { listerValidationsAutomatiques } from '@/lib/db/leads';
import { ok, gererErreur } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { leads, total } = await listerValidationsAutomatiques(12);
    return ok({
      total,
      validations: leads.map((lead) => ({
        id: lead.id,
        dateReception: lead.dateReception,
        confirmeLe: lead.pointsConfirmesLe,
        nom: lead.nom,
        email: lead.email,
        societe: lead.societe,
        sourceCollecte: lead.sourceCollecte,
        confiance: lead.confiance,
        points: pointsProposesDuLead(lead),
        regleLabel: lead.regleLabel,
        explication: lead.explication,
        raisons: evaluerValidationAutomatique(lead).raisons,
      })),
    });
  } catch (erreur) {
    return gererErreur(erreur);
  }
}
