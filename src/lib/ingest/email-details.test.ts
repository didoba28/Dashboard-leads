import { describe, expect, it } from 'vitest';
import { extraireDetailsFormulaireEmail } from './email-details';

describe('extraireDetailsFormulaireEmail', () => {
  it('rend lisible une notification Webflow transférée', () => {
    const resultat = extraireDetailsFormulaireEmail(`
      You just received a new form submission. Prénom: Alexis
      Nom: PICARD
      Adresse e-mail: alexis.picard@example.fr
      Numéro de téléphone: 0669456404
      Message: Bonjour, je souhaiterais obtenir un devis.
      La livraison doit être incluse.
      D'où connaissez-vous AirFit ?: Je connais un espace AirFit existant

      ----------------------------------------------------------
      If you believe this is a spam submission...
    `);

    expect(resultat).toEqual({
      prenom: 'Alexis',
      nom: 'PICARD',
      email: 'alexis.picard@example.fr',
      telephone: '0669456404',
      ville: null,
      message: 'Bonjour, je souhaiterais obtenir un devis.\nLa livraison doit être incluse.',
      origine: 'Je connais un espace AirFit existant',
    });
  });

  it('reconnaît aussi les anciens libellés Webflow', () => {
    expect(extraireDetailsFormulaireEmail(`
      You just received a new form submission. Nom & Prénom: GARNI Alain
      Ville: La Mure
      Email: dst@mairiedelamure.fr
      Téléphone: 04 76 00 00 00
    `)).toMatchObject({
      nom: 'GARNI Alain',
      ville: 'La Mure',
      email: 'dst@mairiedelamure.fr',
      telephone: '04 76 00 00 00',
    });
  });

  it('renvoie null quand aucun champ de formulaire n’est détecté', () => {
    expect(extraireDetailsFormulaireEmail('Simple message Slack sans formulaire.')).toBeNull();
  });
});
