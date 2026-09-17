import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { leadDepuisWebflow, schemaWebflow, verifierSignatureWebflow } from './webflow';

describe('schemaWebflow', () => {
  it('accepte le format v2 (payload)', () => {
    const resultat = schemaWebflow.safeParse({
      triggerType: 'form_submission',
      payload: {
        name: 'Demande de catalogue',
        siteId: 'site123',
        formId: 'form456',
        submittedAt: '2026-10-05T09:12:00.000Z',
        data: { Nom: 'Marie Dupont', Email: 'm.dupont@mairie-lyon.fr' },
      },
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.nomFormulaire).toBe('Demande de catalogue');
      expect(resultat.data.data['Email']).toBe('m.dupont@mairie-lyon.fr');
      expect(resultat.data.soumisLe).toBe('2026-10-05T09:12:00.000Z');
      expect(resultat.data.siteId).toBe('site123');
      expect(resultat.data.formId).toBe('form456');
    }
  });

  it('accepte le format v1 (legacy)', () => {
    const resultat = schemaWebflow.safeParse({
      name: 'Contact',
      site: 'siteAncien',
      d: '2026-01-02T00:00:00.000Z',
      data: { Nom: 'Paul Martin' },
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.nomFormulaire).toBe('Contact');
      expect(resultat.data.soumisLe).toBe('2026-01-02T00:00:00.000Z');
      expect(resultat.data.siteId).toBe('siteAncien');
      expect(resultat.data.formId).toBeNull();
    }
  });

  it('normalise les nombres, booléens et tableaux (cases à cocher) en chaînes', () => {
    const resultat = schemaWebflow.parse({
      name: 'Formulaire',
      data: {
        'Nombre de sites': 3,
        Newsletter: true,
        Options: ['A', 'B', 'C'],
      },
    });
    expect(resultat.data['Nombre de sites']).toBe('3');
    expect(resultat.data['Newsletter']).toBe('true');
    expect(resultat.data['Options']).toBe('A, B, C');
  });

  it('rejette une soumission sans aucun champ', () => {
    const resultat = schemaWebflow.safeParse({ name: 'Formulaire', data: {} });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.message).toMatch(/aucun champ/);
    }
  });
});

describe('verifierSignatureWebflow', () => {
  const secret = 'secret-de-test';

  function signer(timestamp: string, corpsBrut: string): string {
    return createHmac('sha256', secret).update(`${timestamp}:${corpsBrut}`).digest('hex');
  }

  it('accepte une signature valide', () => {
    const corpsBrut = '{"name":"Contact"}';
    const maintenant = 1_700_000_000_000;
    const timestamp = String(maintenant);
    const signature = signer(timestamp, corpsBrut);

    const erreur = verifierSignatureWebflow({ corpsBrut, timestamp, signature, secret, maintenant });
    expect(erreur).toBeNull();
  });

  it('rejette une signature falsifiée', () => {
    const corpsBrut = '{"name":"Contact"}';
    const maintenant = 1_700_000_000_000;
    const timestamp = String(maintenant);

    const erreur = verifierSignatureWebflow({
      corpsBrut,
      timestamp,
      signature: 'deadbeef',
      secret,
      maintenant,
    });
    expect(erreur).not.toBeNull();
  });

  it('rejette un horodatage trop ancien', () => {
    const corpsBrut = '{"name":"Contact"}';
    const maintenant = 1_700_000_000_000;
    const timestampAncien = String(maintenant - 10 * 60 * 1000);
    const signature = signer(timestampAncien, corpsBrut);

    const erreur = verifierSignatureWebflow({
      corpsBrut,
      timestamp: timestampAncien,
      signature,
      secret,
      maintenant,
    });
    expect(erreur).not.toBeNull();
  });

  it("n'exige pas de signature quand le secret est absent", () => {
    const erreur = verifierSignatureWebflow({
      corpsBrut: '{"name":"Contact"}',
      timestamp: null,
      signature: null,
      secret: undefined,
    });
    expect(erreur).toBeNull();
  });
});

describe('leadDepuisWebflow', () => {
  it('classe en collectivité une demande de catalogue réaliste', () => {
    const entree = schemaWebflow.parse({
      triggerType: 'form_submission',
      payload: {
        name: 'Demande de catalogue',
        siteId: 'site123',
        formId: 'form456',
        submittedAt: '2026-10-05T09:12:00.000Z',
        data: {
          Nom: 'Marie Dupont',
          Email: 'm.dupont@mairie-lyon.fr',
          Organisme: 'Mairie de Lyon',
          Message: 'Nous souhaitons recevoir votre catalogue.',
        },
      },
    });

    const lead = leadDepuisWebflow(entree);
    expect(lead.segment).toBe('collectivite');
    expect(lead.sourceCollecte).toBe('site_web');
    expect(lead.leadMagnet).toBe('Demande de catalogue');
    expect(lead.dateReception).toBe('2026-10-05');
    expect(lead.societe).toBe('Mairie de Lyon');
    expect(lead.email).toBe('m.dupont@mairie-lyon.fr');
    expect(lead.nom).toBe('Marie Dupont');
  });

  it("reconnaît le champ « Organisme » comme société", () => {
    const entree = schemaWebflow.parse({
      name: 'Contact',
      data: { Organisme: 'Acme SAS', Email: 'contact@acme.fr' },
    });
    const lead = leadDepuisWebflow(entree);
    expect(lead.societe).toBe('Acme SAS');
  });

  it('reprend les champs du formulaire AirFit actuellement publié', () => {
    const entree = schemaWebflow.parse({
      triggerType: 'form_submission',
      payload: {
        name: 'Subventions - Lead Magnet',
        data: {
          'Nom et Prénom': 'Marie Dupont',
          Commune: 'Mairie de Lyon',
          Mail: 'marie@example.fr',
          Téléphone: '0601020304',
          'Precisions sur votre projet (optionnel)': 'Nous cherchons une station sportive.',
        },
      },
    });

    const lead = leadDepuisWebflow(entree);
    expect(lead.nom).toBe('Marie Dupont');
    expect(lead.societe).toBe('Mairie de Lyon');
    expect(lead.ville).toBe('Mairie de Lyon');
    expect(lead.email).toBe('marie@example.fr');
    expect(lead.message).toBe('Nous cherchons une station sportive.');
    expect(lead.leadMagnet).toBe('Subventions - Lead Magnet');
  });

  it('utilise la date du jour si aucune date de soumission n’est fournie', () => {
    const entree = schemaWebflow.parse({ name: 'Contact', data: { Email: 'a@b.fr' } });
    const lead = leadDepuisWebflow(entree);
    expect(lead.dateReception).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
