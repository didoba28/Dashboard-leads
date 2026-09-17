import { gererErreur, ok } from '@/lib/api/http';
import { scorerLead } from '@/lib/domain/scoring';
import { lireReglages } from '@/lib/db/settings';
import { z } from 'zod';
import { INITIATIVES, RELATIONS, SEGMENTS, TYPES_DEMANDE } from '@/lib/domain/taxonomy';

export const dynamic = 'force-dynamic';

const schema = z.object({
  segment: z.enum(SEGMENTS),
  relation: z.enum(RELATIONS).default('prospect'),
  typeDemande: z.enum(TYPES_DEMANDE),
  initiative: z.enum(INITIATIVES).default('inbound_site'),
});

/** Simulateur : « combien vaut ce lead ? », sans rien écrire en base. */
export async function POST(request: Request) {
  try {
    const entree = schema.parse(await request.json());
    const reglages = await lireReglages();
    return ok(scorerLead(entree, { arbitrageB2cNewsletter: reglages.arbitrageB2cNewsletter }));
  } catch (err) {
    return gererErreur(err);
  }
}
