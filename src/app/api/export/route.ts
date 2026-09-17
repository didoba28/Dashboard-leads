/** Export CSV des leads (filtrable via la même query string que `/api/leads`). */
import { NextResponse } from 'next/server';
import { filtresDepuisUrl, gererErreur } from '@/lib/api/http';
import { genererCsv, type EnteteExportCsv } from '@/lib/csv';
import { listerTousLeads } from '@/lib/db/leads';
import { aujourdHui, type Lead } from '@/lib/domain/lead';
import { pointsEffectifs } from '@/lib/domain/scoring';
import {
  LABELS_INITIATIVE,
  LABELS_RELATION,
  LABELS_SEGMENT,
  LABELS_SOURCE_COLLECTE,
  LABELS_STATUT,
  LABELS_TYPE_ACTIVATION,
  LABELS_TYPE_DEMANDE,
} from '@/lib/domain/taxonomy';

export const dynamic = 'force-dynamic';

const ENTETES_EXPORT: EnteteExportCsv[] = [
  { cle: 'dateReception', label: 'Date de réception' },
  { cle: 'nom', label: 'Nom' },
  { cle: 'email', label: 'E-mail' },
  { cle: 'telephone', label: 'Téléphone' },
  { cle: 'societe', label: 'Société' },
  { cle: 'fonction', label: 'Fonction' },
  { cle: 'ville', label: 'Ville' },
  { cle: 'segment', label: 'Segment' },
  { cle: 'relation', label: 'Relation' },
  { cle: 'typeDemande', label: 'Type de demande' },
  { cle: 'initiative', label: 'Initiative' },
  { cle: 'sourceCollecte', label: 'Source' },
  { cle: 'campagne', label: 'Campagne' },
  { cle: 'leadMagnet', label: 'Lead magnet' },
  { cle: 'statut', label: 'Statut' },
  { cle: 'typeActivation', label: "Type d'activation" },
  { cle: 'dateActivation', label: "Date d'activation" },
  { cle: 'proprietaire', label: 'Propriétaire' },
  { cle: 'tags', label: 'Tags' },
  { cle: 'points', label: 'Points' },
  { cle: 'pointsOverride', label: 'Points forcés' },
  { cle: 'eligible', label: 'Lead entrant' },
  { cle: 'eligibleActivation', label: 'Compte en activation' },
  { cle: 'regleLabel', label: 'Règle appliquée' },
  { cle: 'aVerifier', label: 'À vérifier' },
];

function ligneExport(lead: Lead): Record<string, unknown> {
  return {
    dateReception: lead.dateReception,
    nom: lead.nom,
    email: lead.email,
    telephone: lead.telephone,
    societe: lead.societe,
    fonction: lead.fonction,
    ville: lead.ville,
    segment: LABELS_SEGMENT[lead.segment],
    relation: LABELS_RELATION[lead.relation],
    typeDemande: LABELS_TYPE_DEMANDE[lead.typeDemande],
    initiative: LABELS_INITIATIVE[lead.initiative],
    sourceCollecte: LABELS_SOURCE_COLLECTE[lead.sourceCollecte],
    campagne: lead.campagne,
    leadMagnet: lead.leadMagnet,
    statut: LABELS_STATUT[lead.statut],
    typeActivation: lead.typeActivation ? LABELS_TYPE_ACTIVATION[lead.typeActivation] : null,
    dateActivation: lead.dateActivation,
    proprietaire: lead.proprietaire,
    tags: lead.tags.join(', '),
    points: pointsEffectifs({ points: lead.points, pointsOverride: lead.pointsOverride }),
    pointsOverride: lead.pointsOverride,
    eligible: lead.eligible,
    eligibleActivation: lead.eligibleActivation,
    regleLabel: lead.regleLabel,
    aVerifier: lead.aVerifier,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filtres = filtresDepuisUrl(url);
    const leads = await listerTousLeads(filtres);
    const csv = genererCsv(leads.map(ligneExport), ENTETES_EXPORT);
    const suffixe = filtres.periode ?? aujourdHui();

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-${suffixe}.csv"`,
      },
    });
  } catch (err) {
    return gererErreur(err);
  }
}
