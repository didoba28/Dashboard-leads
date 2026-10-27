import { filtresDepuisUrl, gererErreur, ok } from '@/lib/api/http';
import { creerLead, listerLeads, mettreAJourLead } from '@/lib/db/leads';
import { schemaLeadInput } from '@/lib/domain/lead';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const filtres = filtresDepuisUrl(new URL(request.url));
    return ok(await listerLeads(filtres), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return gererErreur(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schemaLeadInput.parse(body);
    const { lead, doublon } = await creerLead(parsed, { dedupliquer: body?.dedupliquer !== false });
    const protege = !doublon ? await mettreAJourLead(lead.id, parsed, { manuelle: true }) : lead;
    return ok({ lead: protege ?? lead, doublon }, { status: doublon ? 200 : 201 });
  } catch (err) {
    return gererErreur(err);
  }
}
