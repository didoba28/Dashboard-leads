import { erreur, gererErreur, ok } from '@/lib/api/http';
import { lireLead, mettreAJourLead, supprimerLead } from '@/lib/db/leads';
import { schemaLeadPatch } from '@/lib/domain/lead';

export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Contexte) {
  try {
    const { id } = await params;
    const lead = lireLead(id);
    return lead ? ok(lead) : erreur('Lead introuvable', 404);
  } catch (err) {
    return gererErreur(err);
  }
}

export async function PATCH(request: Request, { params }: Contexte) {
  try {
    const { id } = await params;
    const patch = schemaLeadPatch.parse(await request.json());
    const lead = mettreAJourLead(id, patch);
    return lead ? ok(lead) : erreur('Lead introuvable', 404);
  } catch (err) {
    return gererErreur(err);
  }
}

export async function DELETE(_request: Request, { params }: Contexte) {
  try {
    const { id } = await params;
    return supprimerLead(id) ? ok({ supprime: true }) : erreur('Lead introuvable', 404);
  } catch (err) {
    return gererErreur(err);
  }
}
