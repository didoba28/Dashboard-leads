/**
 * Import en masse de leads, depuis du CSV brut ou des objets déjà structurés.
 *
 * Une ligne invalide (parsing CSV raté ou validation `schemaLeadInput` en
 * échec) n'interrompt jamais l'import : elle est comptée en rejet et
 * détaillée dans `erreurs`.
 */
import { ZodError } from 'zod';
import { erreur, gererErreur, ok } from '@/lib/api/http';
import { lignesCsvVersLeads, parserCsv, type ErreurLigneCsv } from '@/lib/csv';
import { creerLead } from '@/lib/db/leads';
import { schemaLeadInput } from '@/lib/domain/lead';

export const dynamic = 'force-dynamic';

const LIMITE_LIGNES = 5000;

interface RapportImport {
  total: number;
  crees: number;
  doublons: number;
  rejetes: number;
  erreurs: ErreurLigneCsv[];
}

function depuisCsv(contenu: string): { entrees: unknown[]; erreursParsing: ErreurLigneCsv[] } {
  const { lignes } = parserCsv(contenu);
  const { valides, erreurs } = lignesCsvVersLeads(lignes);
  return { entrees: valides, erreursParsing: erreurs };
}

function messageErreur(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues.map((i) => `${i.path.join('.') || 'valeur'} : ${i.message}`).join('; ');
  }
  return err instanceof Error ? err.message : String(err);
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? '';

    let entrees: unknown[];
    let erreursParsing: ErreurLigneCsv[];

    if (contentType.includes('text/csv')) {
      const corps = await request.text();
      ({ entrees, erreursParsing } = depuisCsv(corps));
    } else {
      const body = (await request.json()) as { csv?: unknown; leads?: unknown } | null;
      if (typeof body?.csv === 'string') {
        ({ entrees, erreursParsing } = depuisCsv(body.csv));
      } else if (Array.isArray(body?.leads)) {
        entrees = body.leads;
        erreursParsing = [];
      } else {
        return erreur('Corps invalide : attendu { leads: [...] } ou { csv: "..." }.', 400);
      }
    }

    const total = entrees.length + erreursParsing.length;
    if (total > LIMITE_LIGNES) {
      return erreur(
        `Trop de lignes à importer (${total}) : la limite est de ${LIMITE_LIGNES} par appel.`,
        413,
      );
    }

    const rapport: RapportImport = {
      total,
      crees: 0,
      doublons: 0,
      rejetes: erreursParsing.length,
      erreurs: [...erreursParsing],
    };

    entrees.forEach((entree, index) => {
      try {
        const parsed = schemaLeadInput.parse(entree);
        const { doublon } = creerLead(parsed, { dedupliquer: true });
        if (doublon) rapport.doublons++;
        else rapport.crees++;
      } catch (err) {
        rapport.rejetes++;
        rapport.erreurs.push({ ligne: index + 1, message: messageErreur(err) });
      }
    });

    return ok(rapport);
  } catch (err) {
    return gererErreur(err);
  }
}
