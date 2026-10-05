import { erreur, gererErreur, ok } from '@/lib/api/http';
import { clientAuthServeur } from '@/lib/auth/server';
import { emailAutorise } from '@/lib/auth/config';
import { confirmerPointsLead } from '@/lib/db/leads';

export const dynamic = 'force-dynamic';

type Contexte = { params: Promise<{ id: string }> };

/** La confirmation vient d'une personne connectée, jamais du jeton d'ingestion. */
export async function POST(_request: Request, { params }: Contexte) {
  try {
    const auth = await clientAuthServeur();
    const { data, error } = await auth.auth.getUser();
    if (error || !emailAutorise(data.user?.email)) {
      return erreur('Connexion personnelle requise pour confirmer les points.', 401);
    }

    const { id } = await params;
    const lead = await confirmerPointsLead(id, data.user!.email!.toLowerCase());
    return lead ? ok(lead) : erreur('Lead introuvable ou points déjà confirmés.', 409);
  } catch (err) {
    return gererErreur(err);
  }
}
