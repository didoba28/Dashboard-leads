import { gererErreur, ok } from '@/lib/api/http';
import { configurerNotion } from '@/lib/notion/sync';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z
  .object({
    databaseId: z.string().trim().min(1).optional(),
    parentPageId: z.string().trim().min(1).optional(),
    titre: z.string().trim().min(1).max(120).optional(),
  })
  .optional();

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    return ok(await configurerNotion(schema.parse(body) ?? {}));
  } catch (err) {
    return gererErreur(err);
  }
}
