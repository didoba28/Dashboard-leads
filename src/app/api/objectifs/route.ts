import { gererErreur, ok } from '@/lib/api/http';
import { ecrireObjectif, lireObjectif, lireTousObjectifs } from '@/lib/db/settings';
import { z } from 'zod';
import { estIdPeriodeValide } from '@/lib/domain/periods';

export const dynamic = 'force-dynamic';

const schemaPalier = z.object({
  seuil: z.number().min(0).max(100000),
  montant: z.number().min(0).max(1000000),
});

const schemaObjectif = z.object({
  periode: z.string().refine(estIdPeriodeValide, 'Période attendue au format YYYY-Q[1-4]'),
  ciblePoints: z.number().min(0).max(100000),
  paliersPoints: z.array(schemaPalier).max(10),
  paliersActivation: z.array(schemaPalier).max(10),
  primeParOpportuniteSupplementaire: z.number().min(0).max(10000),
  cibleActivation: z.number().min(0).max(100000),
});

export async function GET(request: Request) {
  try {
    const periode = new URL(request.url).searchParams.get('periode');
    if (periode) return ok(await lireObjectif(periode));
    return ok(await lireTousObjectifs());
  } catch (err) {
    return gererErreur(err);
  }
}

export async function PUT(request: Request) {
  try {
    return ok(await ecrireObjectif(schemaObjectif.parse(await request.json())));
  } catch (err) {
    return gererErreur(err);
  }
}
