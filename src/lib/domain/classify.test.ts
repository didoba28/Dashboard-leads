import { describe, expect, it } from 'vitest';
import { SEUIL_CONFIANCE, classifier, extraireChamps, normaliserTexte } from './classify';
import { scorerLead } from './scoring';

describe('normaliserTexte', () => {
  it('retire accents et casse', () => {
    expect(normaliserTexte('Communauté  d’Agglomération')).toBe('communaute d agglomeration');
  });
});

describe('extraireChamps', () => {
  it('lit les paires clé : valeur d’un mail de formulaire', () => {
    const champs = extraireChamps(
      ['Nom : Dupont', 'Prénom: Marie', '**Société** : Mairie de Lyon', 'Message : Bonjour'].join('\n'),
    );
    expect(champs).toMatchObject({ nom: 'Dupont', prenom: 'Marie', societe: 'Mairie de Lyon' });
  });

  it('ignore les lignes sans séparateur', () => {
    expect(extraireChamps('juste une phrase sans deux points')).toEqual({});
  });
});

describe('classifier', () => {
  it('détecte une collectivité depuis un domaine public', () => {
    const r = classifier({
      sujet: 'Téléchargement fiche technique',
      expediteur: 'Marie Dupont <m.dupont@mairie-lyon.fr>',
      corps: 'Bonjour, je souhaite la fiche technique du modèle X.',
    });
    expect(r.segment).toBe('collectivite');
    expect(r.typeDemande).toBe('fiche_technique');
    expect(r.email).toBe('m.dupont@mairie-lyon.fr');
    expect(r.nom).toBe('Marie Dupont');
    expect(scorerLead(r).points).toBe(1);
  });

  it('classe un particulier en B2C', () => {
    const r = classifier({
      sujet: 'Demande de renseignements',
      expediteur: 'jean.martin@gmail.com',
      corps: 'Bonjour, je voudrais des informations.',
    });
    expect(r.segment).toBe('b2c');
    expect(scorerLead(r).points).toBe(0.5);
  });

  it('classe en B2B un domaine professionnel', () => {
    const r = classifier({ expediteur: 'a.b@acme-industries.com', corps: 'Demande de devis' });
    expect(r.segment).toBe('b2b');
    expect(r.typeDemande).toBe('demande_prix');
  });

  it('repère un distributeur et l’exclut au scoring', () => {
    const r = classifier({
      sujet: 'Fiche technique',
      expediteur: 'contact@revendeur-pro.fr',
      corps: 'En tant que distributeur, merci de m’envoyer la fiche technique.',
    });
    expect(r.relation).toBe('distributeur');
    expect(scorerLead(r).eligible).toBe(false);
  });

  it('lit l’initiative dans les UTM', () => {
    const r = classifier({
      corps: 'Téléchargement du livre blanc',
      url: 'https://exemple.fr/lp?utm_source=newsletter&utm_medium=email&utm_campaign=nl-octobre',
    });
    expect(r.initiative).toBe('newsletter');
    expect(r.campagne).toBe('nl-octobre');
    expect(scorerLead(r).points).toBe(1);
  });

  it('distingue une campagne outbound', () => {
    const r = classifier({
      corps: 'Livre blanc téléchargé',
      url: 'https://exemple.fr/lp?utm_source=outbound&utm_campaign=camp-q4',
    });
    expect(r.initiative).toBe('outbound_campagne');
    const score = scorerLead(r);
    expect(score.points).toBe(0.5);
    expect(score.eligibleActivation).toBe(false);
  });

  it('détecte un BDR', () => {
    expect(classifier({ corps: 'Lead transmis par le BDR après appel' }).initiative).toBe('outbound_bdr');
  });

  it('préfère la société au domaine grand public', () => {
    const r = classifier({
      expediteur: 'dir@gmail.com',
      corps: 'Société : Acme SAS\nMessage : demande de prix',
    });
    expect(r.segment).toBe('b2b');
    expect(r.societe).toBe('Acme SAS');
  });

  it('rend une confiance faible quand rien n’est identifiable', () => {
    const r = classifier({ corps: 'bonjour' });
    expect(r.confiance).toBeLessThan(SEUIL_CONFIANCE);
    expect(r.indices.length).toBeGreaterThan(0);
  });

  it('extrait le téléphone au format français', () => {
    expect(classifier({ corps: 'Tel : 06 12 34 56 78' }).telephone).toBe('06 12 34 56 78');
  });

  it('ne renvoie jamais un e-mail malformé', () => {
    expect(classifier({ corps: 'Email : pas-un-email' }).email).toBeNull();
  });
});
