import { describe, expect, it } from 'vitest';
import { leadDepuisFormulaire, schemaFormulaire } from './formulaire';

describe('schemaFormulaire', () => {
  it('rejette une charge utile entièrement vide', () => {
    const resultat = schemaFormulaire.safeParse({});
    expect(resultat.success).toBe(false);
  });

  it('accepte une entrée avec seulement un e-mail', () => {
    const resultat = schemaFormulaire.safeParse({ email: 'jean@acme.fr' });
    expect(resultat.success).toBe(true);
  });

  it('accepte une entrée avec seulement un sujet', () => {
    const resultat = schemaFormulaire.safeParse({ sujet: 'Demande de renseignements' });
    expect(resultat.success).toBe(true);
  });
});

describe('leadDepuisFormulaire', () => {
  it('fait primer le segment explicitement fourni sur la déduction du classifieur', () => {
    // `email` passé en `champs` (donc injecté dans le corps analysé par le classifieur,
    // conformément au contrat `classifier({ sujet, corps, url })`) : un domaine grand
    // public sans société ferait deviner b2c.
    const champs = { email: 'jean.dupont@gmail.com' };

    const sansOverride = schemaFormulaire.parse({
      sujet: 'Demande de devis',
      message: 'Je voudrais un devis pour mon jardin personnel.',
      champs,
    });
    expect(leadDepuisFormulaire(sansOverride).segment).toBe('b2c');

    const entree = schemaFormulaire.parse({
      sujet: 'Demande de devis',
      message: 'Je voudrais un devis pour mon jardin personnel.',
      champs,
      segment: 'b2b',
    });
    const lead = leadDepuisFormulaire(entree);
    expect(lead.segment).toBe('b2b');
    expect(lead.dimensionsFournies).toContain('segment');
  });

  it('accepte les libellés français pour les dimensions explicites', () => {
    const entree = schemaFormulaire.parse({
      sujet: 'Inscription',
      segment: 'Collectivité',
      initiative: 'Newsletter',
    });
    const lead = leadDepuisFormulaire(entree);
    expect(lead.segment).toBe('collectivite');
    expect(lead.initiative).toBe('newsletter');
  });

  it('se replie sur la déduction du classifieur si la valeur fournie est inconnue, sans erreur', () => {
    const entree = schemaFormulaire.parse({
      sujet: 'Demande',
      segment: 'valeur-totalement-inconnue',
    });
    expect(() => leadDepuisFormulaire(entree)).not.toThrow();
    const lead = leadDepuisFormulaire(entree);
    expect(lead.dimensionsFournies).not.toContain('segment');
    expect(lead.segment).toBeDefined();
  });

  it('renvoie une confiance de 1 quand les quatre dimensions sont fournies explicitement', () => {
    const entree = schemaFormulaire.parse({
      sujet: 'Demande',
      segment: 'b2b',
      relation: 'prospect',
      typeDemande: 'demande_prix',
      initiative: 'inbound_site',
    });
    const lead = leadDepuisFormulaire(entree);
    expect(lead.confiance).toBe(1);
    expect(lead.aVerifier).toBe(false);
    expect(lead.dimensionsFournies).toEqual(['segment', 'relation', 'typeDemande', 'initiative']);
  });

  it('marque une entrée pauvre comme « à vérifier »', () => {
    const entree = schemaFormulaire.parse({ sujet: 'Bonjour' });
    const lead = leadDepuisFormulaire(entree);
    expect(lead.aVerifier).toBe(true);
  });

  it('reporte pointsForces sur pointsOverride avec une raison par défaut', () => {
    const entree = schemaFormulaire.parse({ sujet: 'Demande prioritaire', pointsForces: 1 });
    const lead = leadDepuisFormulaire(entree);
    expect(lead.pointsOverride).toBe(1);
    expect(lead.pointsOverrideRaison).toBe('Transmis par l’automatisation');
  });

  it('conserve la raison explicite de pointsForces quand elle est fournie', () => {
    const entree = schemaFormulaire.parse({
      sujet: 'Demande prioritaire',
      pointsForces: 0.5,
      raisonPointsForces: 'Lead validé par téléphone',
    });
    const lead = leadDepuisFormulaire(entree);
    expect(lead.pointsOverride).toBe(0.5);
    expect(lead.pointsOverrideRaison).toBe('Lead validé par téléphone');
  });

  it('ne remplit dimensionsFournies que pour les dimensions réellement transmises', () => {
    const entree = schemaFormulaire.parse({
      sujet: 'Demande',
      typeDemande: 'catalogue',
      initiative: 'salon_evenement',
    });
    const lead = leadDepuisFormulaire(entree);
    expect(lead.dimensionsFournies).toEqual(['typeDemande', 'initiative']);
  });
});
