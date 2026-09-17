import { filtresDepuisUrl, gererErreur, ok } from '@/lib/api/http';
import { creerLead, listerLeads } from '@/lib/db/leads';
import { schemaLeadInput } from '@/lib/domain/lead';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const filtres = filtresDepuisUrl(new URL(request.url));
    return ok(listerLeads(filtres));
  } catch (err) {
    return gererErreur(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schemaLeadInput.parse(body);
    const { lead, doublon } = creerLead(parsed, { dedupliquer: body?.dedupliquer !== false });
    return ok({ lead, doublon }, { status: doublon ? 200 : 201 });
  } catch (err) {
    return gererErreur(err);
  }
}
