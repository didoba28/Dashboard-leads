import { gererErreur, ok } from '@/lib/api/http';
import { pullDepuisNotion, pushVersNotion, synchroniser } from '@/lib/notion/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const direction = new URL(request.url).searchParams.get('direction');
    const forcer = new URL(request.url).searchParams.get('force') === 'true';
    const resultat =
      direction === 'pull' ? await pullDepuisNotion()
      : direction === 'push' ? await pushVersNotion({ forcer })
      : await synchroniser();
    return ok(resultat, { status: resultat.succes ? 200 : 502 });
  } catch (err) {
    return gererErreur(err);
  }
}
