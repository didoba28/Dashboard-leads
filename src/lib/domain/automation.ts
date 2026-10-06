import type { Lead } from './lead';
import type { SourceCollecte } from './taxonomy';

/** Seuil métier choisi pour laisser l'automatisation confirmer un score. */
export const SEUIL_VALIDATION_AUTOMATIQUE = 0.9;

/** Valeur stable conservée dans `points_confirmes_par` pour l'audit et le rapport. */
export const AUTEUR_VALIDATION_AUTOMATIQUE = 'Automatisation — confiance ≥ 90 %';

const SOURCES_AUTOMATISEES = new Set<SourceCollecte>([
  'slack_inbound',
  'email_formulaire',
  'site_web',
  'notion',
]);

type CandidatAutomatisation = Pick<
  Lead,
  'aVerifier' | 'confiance' | 'email' | 'telephone' | 'sourceCollecte' | 'typeDemande' | 'leadMagnet'
>;

export interface DecisionValidationAutomatique {
  valider: boolean;
  raisons: string[];
  blocage: string | null;
}

export function estEmailInterneAirfit(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase().endsWith('@airfit.co') ?? false;
}

/**
 * Décision volontairement conservatrice : une forte confiance ne suffit pas
 * sans contact externe et sans provenance issue d'un canal automatisé connu.
 */
export function evaluerValidationAutomatique(
  lead: CandidatAutomatisation,
): DecisionValidationAutomatique {
  const confiance = lead.confiance ?? 0;
  const raisons: string[] = [];

  if (!SOURCES_AUTOMATISEES.has(lead.sourceCollecte)) {
    return { valider: false, raisons, blocage: 'Source manuelle ou importée.' };
  }
  if (estEmailInterneAirfit(lead.email)) {
    return { valider: false, raisons, blocage: 'Adresse interne @airfit.co.' };
  }
  if (!lead.email && !lead.telephone) {
    return { valider: false, raisons, blocage: 'Aucun e-mail externe ni téléphone.' };
  }
  if (lead.aVerifier) {
    return { valider: false, raisons, blocage: 'Le lead porte encore l’indicateur « à vérifier ».' };
  }
  if (confiance < SEUIL_VALIDATION_AUTOMATIQUE) {
    return {
      valider: false,
      raisons,
      blocage: `Confiance ${Math.round(confiance * 100)} %, sous le seuil de 90 %.`,
    };
  }

  raisons.push(`Confiance ${Math.round(confiance * 100)} %.`);
  raisons.push(lead.email ? 'E-mail externe identifié.' : 'Téléphone identifié.');
  raisons.push(
    lead.leadMagnet
      ? `Origine identifiée : ${lead.leadMagnet}.`
      : `Type de demande identifié : ${lead.typeDemande}.`,
  );
  return { valider: true, raisons, blocage: null };
}
