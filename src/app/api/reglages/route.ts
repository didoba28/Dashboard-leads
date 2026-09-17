import { gererErreur, ok } from '@/lib/api/http';
import { ecrireReglages, lireReglages } from '@/lib/db/settings';
import { rescorerTout } from '@/lib/db/leads';
import { z } from 'zod';
import { estIdPeriodeValide } from '@/lib/domain/periods';

export const dynamic = 'force-dynamic';

const schema = z
  .object({
    periodeActive: z.string().refine(estIdPeriodeValide, 'Période attendue au format YYYY-Q[1-4]'),
    arbitrageB2cNewsletter: z.enum(['newsletter', 'segment']),
    fenetreDedupeJours: z.number().int().min(0).max(365),
  })
  .partial();

export async function GET() {
  try {
    return ok(await lireReglages());
  } catch (err) {
    return gererErreur(err);
  }
}

export async function PUT(request: Request) {
  try {
    const patch = schema.parse(await request.json());
    const avant = await lireReglages();
    const reglages = await ecrireReglages(patch);
    // Changer l'arbitrage change la valeur des leads déjà en base : on recalcule.
    const rescored =
      patch.arbitrageB2cNewsletter && patch.arbitrageB2cNewsletter !== avant.arbitrageB2cNewsletter
        ? await rescorerTout()
        : 0;
    return ok({ reglages, leadsRescores: rescored });
  } catch (err) {
    return gererErreur(err);
  }
}
