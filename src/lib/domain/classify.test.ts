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
  it('ne confond pas la ville SAINT-SAVIN avec le mot-clé SAV', () => {
    const r = classifier({ corps: 'Nouveau contact AirFit : CHRISTOPHE MALINS (SAINT-SAVIN)' });
    expect(r.relation).toBe('prospect');
    expect(r.initiative).toBe('inbound_site');
  });

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

  it('ne déduit pas B2C du seul domaine grand public', () => {
    const r = classifier({
      sujet: 'Demande de renseignements',
      expediteur: 'jean.martin@gmail.com',
      corps: 'Bonjour, je voudrais des informations.',
    });
    expect(r.segment).toBe('b2b');
    expect(r.indices.join(' ')).toContain('segment à confirmer');
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

  it('reconnaît une association comme une classe distincte', () => {
    const r = classifier({
      corps: 'Nom : Camille Martin\nAssociation : Club sportif des Rives\nEmail : camille@club-rives.fr',
    });
    expect(r.segment).toBe('association');
    expect(scorerLead(r).points).toBe(1);
  });

  it('privilégie l’adresse externe du formulaire à l’expéditeur AirFit', () => {
    const r = classifier({
      expediteur: 'Automatisation <notifications@airfit.co>',
      corps: 'Nom : Marie Dupont\nEmail : marie@mairie-lyon.fr\nMessage : demande de contact',
    });
    expect(r.email).toBe('marie@mairie-lyon.fr');
  });

  it('ignore un contact qui ne contient qu’une adresse AirFit', () => {
    const r = classifier({
      corps: 'Nouveau lead AirFit\nNom : Adel\nTéléphone : 06 12 34 56 78\nEmail : adel@airfit.co\nMessage : simulateur',
    });
    expect(r.email).toBeNull();
    expect(r.confiance).toBeLessThan(0.9);
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
