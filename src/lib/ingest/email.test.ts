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

  it('classe en b2c un mail gmail.com sans société', () => {
    const entree = schemaEmailEntrant.parse({
      sujet: 'Demande de renseignements',
      expediteur: 'jean.martin@gmail.com',
      corpsTexte: 'Bonjour, je voudrais des informations sur vos produits.',
    });

    const lead = leadDepuisEmail(entree);
    expect(lead.segment).toBe('b2c');
  });

  it('utilise la date du jour si recuLe est absent', () => {
    const entree = schemaEmailEntrant.parse({ sujet: 'Demande de devis' });
    const lead = leadDepuisEmail(entree);
    expect(lead.dateReception).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
