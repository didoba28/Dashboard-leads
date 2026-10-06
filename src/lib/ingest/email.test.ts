import { describe, expect, it } from 'vitest';
import { htmlVersTexte, leadDepuisEmail, schemaEmailEntrant } from './email';

describe('schemaEmailEntrant', () => {
  it('rejette un e-mail dont sujet et corps sont vides', () => {
    const resultat = schemaEmailEntrant.safeParse({ sujet: '', corpsTexte: '', corpsHtml: '' });
    expect(resultat.success).toBe(false);
  });

  it('accepte un e-mail avec seulement un sujet', () => {
    const resultat = schemaEmailEntrant.safeParse({ sujet: 'Demande de devis' });
    expect(resultat.success).toBe(true);
  });

  it('normalise les alias Gmail / Make en champs internes', () => {
    const resultat = schemaEmailEntrant.parse({
      subject: 'test alias',
      text: 'Nom : Test Alias',
      receivedAt: '1790839930000',
      fromName: 'Webflow Forms',
      fromEmail: 'notifications@example.com',
    });

    expect(resultat.sujet).toBe('test alias');
    expect(resultat.corpsTexte).toBe('Nom : Test Alias');
    expect(resultat.recuLe).toBe('1790839930000');
    expect(resultat.expediteur).toBe('Webflow Forms <notifications@example.com>');
  });
});

describe('htmlVersTexte', () => {
  it('supprime le contenu des balises script et style', () => {
    const html = '<html><head><style>.a{color:red}</style></head><body>Bonjour<script>alert(1)</script></body></html>';
    expect(htmlVersTexte(html)).toBe('Bonjour');
  });

  it('convertit <br> en saut de ligne', () => {
    expect(htmlVersTexte('Ligne 1<br>Ligne 2')).toBe('Ligne 1\nLigne 2');
  });

  it('insère un saut de ligne après les balises de bloc', () => {
    expect(htmlVersTexte('<p>Nom : Dupont</p><p>Société : Acme</p>')).toBe('Nom : Dupont\nSociété : Acme');
  });

  it('décode les entités HTML', () => {
    expect(htmlVersTexte('Devis &amp; tarifs &lt;urgent&gt; &eacute;t&#233; &quot;ok&quot;')).toBe(
      'Devis & tarifs <urgent> &eacute;té "ok"',
    );
  });
});

describe('leadDepuisEmail', () => {
  it('classe en collectivité un mail de formulaire réaliste', () => {
    const entree = schemaEmailEntrant.parse({
      sujet: 'Nouveau message du formulaire',
      expediteur: 'Marie Dupont <m.dupont@mairie-lyon.fr>',
      corpsTexte: [
        'Nouveau message du formulaire',
        'Nom : Marie Dupont',
        'Société : Mairie de Lyon',
        'Message : je souhaite un devis pour équiper notre parc.',
      ].join('\n'),
      recuLe: '2026-09-10T08:15:00.000Z',
    });

    const lead = leadDepuisEmail(entree);
    expect(lead.segment).toBe('collectivite');
    expect(lead.societe).toBe('Mairie de Lyon');
    expect(lead.sourceCollecte).toBe('email_formulaire');
    expect(lead.dateReception).toBe('2026-09-10');
  });

  it('ne déduit pas B2C du seul domaine gmail.com', () => {
    const entree = schemaEmailEntrant.parse({
      sujet: 'Demande de renseignements',
      expediteur: 'jean.martin@gmail.com',
      corpsTexte: 'Bonjour, je voudrais des informations sur vos produits.',
    });

    const lead = leadDepuisEmail(entree);
    expect(lead.segment).toBe('b2b');
  });

  it('utilise la date du jour si recuLe est absent', () => {
    const entree = schemaEmailEntrant.parse({ sujet: 'Demande de devis' });
    const lead = leadDepuisEmail(entree);
    expect(lead.dateReception).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('convertit le timestamp Gmail en date de réception', () => {
    const entree = schemaEmailEntrant.parse({
      subject: 'test alias',
      text: 'Nom : Test Alias',
      receivedAt: '1790839930000',
    });

    expect(leadDepuisEmail(entree).dateReception).toBe('2026-10-01');
  });

  it('préfère le contact du formulaire aux adresses des signatures', () => {
    const entree = schemaEmailEntrant.parse({
      sujet: 'Fwd: Site AirFit : nouveau message',
      expediteur: 'mehdi@airfit.co',
      corpsTexte: `
        Mehdi Ghariani — +33 7 80 90 37 87 — mehdi@airfit.co
        You just received a new form submission. Nom & Prénom: GARNI Alain
        Ville: La Mure
        Email: dst@mairiedelamure.fr
        Téléphone: 04 76 00 00 00
      `,
    });

    expect(leadDepuisEmail(entree)).toMatchObject({
      nom: 'GARNI Alain',
      email: 'dst@mairiedelamure.fr',
      telephone: '04 76 00 00 00',
      ville: 'La Mure',
    });
  });

  it('utilise le HTML si le texte brut est absent', () => {
    const entree = schemaEmailEntrant.parse({
      sujet: 'Demande de devis',
      corpsHtml: '<p>Nom : Paul Martin</p><p>Message : merci de me rappeler</p>',
    });
    const lead = leadDepuisEmail(entree);
    expect(lead.message).toContain('Paul Martin');
  });
});
