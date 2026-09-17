import { gererErreur, ok } from '@/lib/api/http';
import { etatNotion } from '@/lib/notion/sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok(etatNotion());
  } catch (err) {
    return gererErreur(err);
  }
}
