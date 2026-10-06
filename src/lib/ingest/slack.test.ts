import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  evenementSlackExploitable,
  extraireIdentiteNotificationSlack,
  extraireUrlSlack,
  leadDepuisMessageSlack,
  nettoyerTexteSlack,
  parametresDepuisPayloadSlackMake,
  texteDepuisBlocsSlack,
  verifierSignatureSlack,
} from './slack';

const SECRET = 'secret-de-test';

function signer(corpsBrut: string, timestamp: string, secret = SECRET): string {
  return `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${corpsBrut}`).digest('hex')}`;
}

describe('verifierSignatureSlack', () => {
  it('accepte une signature valide', () => {
    const corpsBrut = '{"type":"event_callback"}';
    const timestamp = '1700000000';
    const signature = signer(corpsBrut, timestamp);
    expect(
      verifierSignatureSlack({ corpsBrut, timestamp, signature, secret: SECRET, maintenant: 1700000010 }),
    ).toBeNull();
  });

  it('rejette une signature falsifiée', () => {
    const corpsBrut = '{"type":"event_callback"}';
    const timestamp = '1700000000';
    expect(
      verifierSignatureSlack({
        corpsBrut,
        timestamp,
        signature: 'v0=abcdef',
        secret: SECRET,
        maintenant: 1700000010,
      }),
    ).not.toBeNull();
  });

  it('rejette quand le secret est absent', () => {
    const corpsBrut = '{}';
    const timestamp = '1700000000';
    const signature = signer(corpsBrut, timestamp);
    expect(
      verifierSignatureSlack({ corpsBrut, timestamp, signature, secret: undefined, maintenant: 1700000010 }),
    ).not.toBeNull();
  });

  it('rejette un timestamp trop ancien (rejeu)', () => {
    const corpsBrut = '{}';
    const timestamp = '1700000000';
    const signature = signer(corpsBrut, timestamp);
    // 10 minutes plus tard : au-delà de la fenêtre de tolérance de 5 minutes.
    expect(
      verifierSignatureSlack({ corpsBrut, timestamp, signature, secret: SECRET, maintenant: 1700000000 + 601 }),
    ).not.toBeNull();
  });
});

describe('nettoyerTexteSlack', () => {
  it('convertit un lien mailto', () => {
    expect(nettoyerTexteSlack('Contact : <mailto:a@b.fr|a@b.fr>')).toBe('Contact : a@b.fr');
  });

  it('convertit un lien nommé en gardant l’URL', () => {
    expect(nettoyerTexteSlack('Voir <https://exemple.fr/lp|notre page>')).toBe('Voir https://exemple.fr/lp');
  });

  it('retire une mention utilisateur', () => {
    expect(nettoyerTexteSlack('Merci <@U12345> pour le lead')).toBe('Merci  pour le lead');
  });

  it('décode les entités HTML', () => {
    expect(nettoyerTexteSlack('Devis &amp; tarifs &lt;urgent&gt;')).toBe('Devis & tarifs <urgent>');
  });
});

describe('extraireUrlSlack', () => {
  it('trouve la première URL http(s)', () => {
    expect(extraireUrlSlack('Voir https://exemple.fr/lp?utm_source=newsletter merci')).toBe(
      'https://exemple.fr/lp?utm_source=newsletter',
    );
  });

  it('renvoie null si aucune URL', () => {
    expect(extraireUrlSlack('bonjour, aucun lien ici')).toBeNull();
  });
});

describe('extraireIdentiteNotificationSlack', () => {
  it('extrait le nom et la ville du message compact AirFit', () => {
    expect(extraireIdentiteNotificationSlack('Nouveau lead AirFit : de Cuniac Titouan (Nancy 54000)')).toEqual({
      nom: 'de Cuniac Titouan',
      ville: 'Nancy',
    });
  });

  it('extrait le format titre puis NOM — VILLE du simulateur', () => {
    expect(extraireIdentiteNotificationSlack([
      '**Nouveau lead AirFit**',
      '**de Cuniac Titouan ** — Nancy 5400',
      '**Téléphone:**',
      '+32471744732',
    ].join('\n'))).toEqual({ nom: 'de Cuniac Titouan', ville: 'Nancy' });
  });

  it('extrait le format Nouveau contact AirFit', () => {
    expect(extraireIdentiteNotificationSlack([
      '**Nouveau contact AirFit**',
      '**CHRISTOPHE MALINS** — SAINT-SAVIN',
    ].join('\n'))).toEqual({ nom: 'CHRISTOPHE MALINS', ville: 'SAINT-SAVIN' });
  });

  it('extrait le format compact Nouveau contact AirFit', () => {
    expect(extraireIdentiteNotificationSlack(
      'Nouveau contact AirFit : CHRISTOPHE MALINS (SAINT-SAVIN)',
    )).toEqual({ nom: 'CHRISTOPHE MALINS', ville: 'SAINT-SAVIN' });
  });

  it('extrait le nom et la ville de la phrase du bot livre blanc', () => {
    expect(extraireIdentiteNotificationSlack(
      'Nouveau Lead entrant : Nathalie Tachet de la ville de la roche bernard vient de télécharger le livre blanc !',
    )).toEqual({ nom: 'Nathalie Tachet', ville: 'la roche bernard' });
  });

  it('ignore un message Slack sans ce format', () => {
    expect(extraireIdentiteNotificationSlack('Nom : Marie Dupont')).toEqual({ nom: null, ville: null });
  });
});

describe('texteDepuisBlocsSlack', () => {
  it('récupère les textes des sections et champs Slack imbriqués', () => {
    const texte = texteDepuisBlocsSlack([
      { type: 'section', text: { type: 'mrkdwn', text: '*Nouveau lead AirFit*' } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*Origine*\nSimulateur' },
          { type: 'mrkdwn', text: '*Ville*\nNancy' },
        ],
      },
    ]);

    expect(texte).toContain('Simulateur');
    expect(texte).toContain('Nancy');
  });

  it('récupère les champs des attachments Slack historiques', () => {
    const texte = texteDepuisBlocsSlack([
      {
        fallback: 'Nouveau lead AirFit',
        fields: [
          { title: 'Téléphone', value: '0662100337', short: true },
          { title: 'Email', value: 'laurent.maillard@avesnes-les-aubert.fr', short: true },
          { title: 'Budget', value: 'Entre 10k et 20k EUR', short: true },
        ],
      },
    ]);

    expect(texte).toContain('Téléphone: 0662100337');
    expect(texte).toContain('Email: laurent.maillard@avesnes-les-aubert.fr');
    expect(texte).toContain('Budget: Entre 10k et 20k EUR');
  });

  it('remet sur une ligne les libellés et valeurs des fields mrkdwn', () => {
    const texte = texteDepuisBlocsSlack([
      { type: 'mrkdwn', text: '*Surface: *\nEntre 150 et 200 m2' },
    ]);
    expect(texte).toBe('Surface: Entre 150 et 200 m2');
  });
});

describe('evenementSlackExploitable', () => {
  it('accepte un message simple', () => {
    expect(evenementSlackExploitable({ type: 'message', text: 'bonjour' })).toBe(true);
  });

  it('accepte un message d’app (bot_id) sans subtype ignoré', () => {
    expect(evenementSlackExploitable({ type: 'message', bot_id: 'B123', text: 'formulaire' })).toBe(true);
  });

  it('ignore les subtypes bot_message, message_changed, message_deleted, channel_join, channel_leave', () => {
    for (const subtype of ['bot_message', 'message_changed', 'message_deleted', 'channel_join', 'channel_leave']) {
      expect(evenementSlackExploitable({ type: 'message', subtype })).toBe(false);
    }
  });

  it('ignore les événements qui ne sont pas des messages', () => {
    expect(evenementSlackExploitable({ type: 'reaction_added' })).toBe(false);
  });
});

describe('leadDepuisMessageSlack', () => {
  it('construit un lead à partir d’un message réaliste de notification de formulaire', () => {
    const texte = [
      'Nouveau message du formulaire',
      'Nom : Marie Dupont',
      'Société : Mairie de Lyon',
      'Email : <mailto:m.dupont@mairie-lyon.fr|m.dupont@mairie-lyon.fr>',
      'Message : je souhaite la fiche technique du modèle X.',
    ].join('\n');

    const lead = leadDepuisMessageSlack({ texte, ts: '1728123456.000200', canal: 'C0INBOUND' });

    expect(lead.sourceCollecte).toBe('slack_inbound');
    expect(lead.segment).toBe('collectivite');
    expect(lead.typeDemande).toBe('fiche_technique');
    expect(lead.email).toBe('m.dupont@mairie-lyon.fr');
    expect(lead.dateReception).toBe('2024-10-05');
    expect(lead.aVerifier).toBe(false);
    expect(lead.confiance).toBeGreaterThanOrEqual(0.6);
    expect(lead.message).toContain('Nouveau message du formulaire');
    expect(lead.rawPayload).toMatchObject({ source: 'slack', canal: 'C0INBOUND', ts: '1728123456.000200' });
  });

  it('marque à vérifier un message peu informatif', () => {
    const lead = leadDepuisMessageSlack({ texte: 'salut', ts: '1728123456', canal: 'C0INBOUND' });
    expect(lead.aVerifier).toBe(true);
    expect(lead.segment).toBe('collectivite');
  });
});

describe('leadDepuisMessageSlack — format compact AirFit', () => {
  it('remplit le nom et la ville', () => {
    const lead = leadDepuisMessageSlack({
      texte: 'Nouveau lead AirFit : de Cuniac Titouan (Nancy 54000)',
      ts: '1790000000',
      canal: 'C0INBOUND',
    });

    expect(lead.nom).toBe('de Cuniac Titouan');
    expect(lead.ville).toBe('Nancy');
  });

  it('classe le message complet du simulateur et atteint le seuil automatique', () => {
    const lead = leadDepuisMessageSlack({
      texte: [
        'Leads simulateur [20 h 51]',
        '**Nouveau lead AirFit**',
        '**de Cuniac Titouan ** — Nancy 5400',
        '**Téléphone:**',
        '+32471744732',
        '**Email:**',
        'titoiauznd@gmail.com',
        '**Budget:** Entre 10k et 20k EUR',
      ].join('\n'),
      ts: '1790000000',
      canal: 'C0INBOUND',
    });

    expect(lead).toMatchObject({
      nom: 'de Cuniac Titouan',
      ville: 'Nancy',
      email: 'titoiauznd@gmail.com',
      typeDemande: 'simulateur',
      aVerifier: false,
    });
    expect(lead.confiance).toBeGreaterThanOrEqual(0.9);
  });

  it('classe la landing simulateur en conservant son origine précise', () => {
    const lead = leadDepuisMessageSlack({
      texte: [
        '**Nouveau contact AirFit**',
        '**CHRISTOPHE MALINS** — SAINT-SAVIN',
        '**Téléphone:** +33786914726',
        '**Email:** cmalins@saintsavin-isere.fr',
        '**Source:** Formulaire contact — landing simulateur',
      ].join('\n'),
      ts: '1790000000',
      canal: 'C0INBOUND',
    });
    expect(lead).toMatchObject({
      nom: 'CHRISTOPHE MALINS',
      ville: 'SAINT-SAVIN',
      typeDemande: 'simulateur',
      leadMagnet: 'Formulaire contact — landing simulateur',
    });
  });

  it('classe le bot livre blanc et extrait son contact', () => {
    const lead = leadDepuisMessageSlack({
      texte: [
        'Le bot des leads entrants 🧲 [12 h 14]',
        'Nouveau Lead entrant : Nathalie Tachet de la ville de la roche bernard vient de télécharger le livre blanc !',
        'Le sales concerné peut le contacter sur son mail : n.tachet@laroche-bernard.bzh',
      ].join('\n'),
      ts: '1790000000',
      canal: 'C0INBOUND',
    });
    expect(lead).toMatchObject({
      nom: 'Nathalie Tachet',
      ville: 'la roche bernard',
      email: 'n.tachet@laroche-bernard.bzh',
      typeDemande: 'livre_blanc',
      segment: 'collectivite',
    });
    expect(lead.confiance).toBeGreaterThanOrEqual(0.9);
  });

  it('détecte l’origine du lead dans les blocs Slack', () => {
    const lead = leadDepuisMessageSlack({
      texte: 'Nouveau lead AirFit : Camille Martin (Lyon 69000)',
      blocs: [
        { type: 'section', fields: [{ type: 'mrkdwn', text: '*Origine*\nLivre blanc' }] },
      ],
      ts: '1790000000',
      canal: 'C0INBOUND',
    });

    expect(lead.typeDemande).toBe('livre_blanc');
    expect(lead.leadMagnet).toBe('livre blanc');
    expect(lead.message).toContain('Livre blanc');
  });
});

describe('parametresDepuisPayloadSlackMake', () => {
  it('normalise les champs courants du module Slack de Make', () => {
    const params = parametresDepuisPayloadSlackMake({
      text: 'Nom : Marie Dupont\nEmail : marie@example.fr\nMessage : demande de devis',
      channelId: 'C0INBOUND',
      receivedAt: '2026-09-22T08:30:00.000Z',
      messageId: 'message-123',
    });

    expect(params.texte).toContain('Marie Dupont');
    expect(params.canal).toBe('C0INBOUND');
    expect(params.ts).toBe('1790065800');
    expect(params.evenement).toMatchObject({ messageId: 'message-123' });
  });

  it('accepte les alias subject et body', () => {
    const params = parametresDepuisPayloadSlackMake({
      subject: 'Nouveau lead Slack',
      body: 'Je souhaite recevoir une fiche technique.',
    });
    expect(params.texte).toBe('Nouveau lead Slack\nJe souhaite recevoir une fiche technique.');
    expect(params.canal).toBe('make');
  });

  it('ajoute l’origine explicite envoyée par Make au texte analysé', () => {
    const params = parametresDepuisPayloadSlackMake({
      text: 'Nouveau lead AirFit : Camille Martin (Lyon 69000)',
      origine: 'Simulateur',
    });
    expect(params.texte).toContain('Origine : Simulateur');
    expect(leadDepuisMessageSlack(params).typeDemande).toBe('simulateur');
  });

  it('utilise le nom du bot et les attachments envoyés par Make', () => {
    const params = parametresDepuisPayloadSlackMake({
      text: 'Nouveau lead AirFit : maillard (avesnes les aubert)',
      botName: 'Leads simulateur',
      attachments: [{
        fields: [
          { title: 'Téléphone', value: '0662100337' },
          { title: 'Email', value: 'laurent.maillard@avesnes-les-aubert.fr' },
          { title: 'Site d’implantation', value: 'Abords de voie pédestre & piste cyclable' },
          { title: 'Budget', value: 'Entre 10k et 20k EUR' },
        ],
      }],
    });
    const lead = leadDepuisMessageSlack(params);

    expect(params.texte).toContain('Origine : Leads simulateur');
    expect(lead).toMatchObject({
      nom: 'maillard',
      ville: 'avesnes les aubert',
      email: 'laurent.maillard@avesnes-les-aubert.fr',
      telephone: '0662100337',
      typeDemande: 'simulateur',
      leadMagnet: 'Leads simulateur',
    });
    expect(lead.message).toContain('Site d’implantation: Abords de voie pédestre & piste cyclable');
  });

  it('accepte les blocs et attachments aplatis par les fonctions Make', () => {
    const params = parametresDepuisPayloadSlackMake({
      text: 'Nouveau lead AirFit : maillard (avesnes les aubert)',
      blocksText: [
        'Téléphone: 0662100337',
        'Email: laurent.maillard@avesnes-les-aubert.fr',
        'Surface: Entre 150 et 200 m2',
      ].join('\n'),
      attachmentTitles: ['Budget', 'Réalisation proposée'].join('\n'),
      attachmentValues: ['Entre 10k et 20k EUR', 'Station Cardio de Ceinture Verte Urbaine'].join('\n'),
      botName: 'Leads simulateur',
    });
    const lead = leadDepuisMessageSlack(params);

    expect(lead).toMatchObject({
      nom: 'maillard',
      ville: 'avesnes les aubert',
      email: 'laurent.maillard@avesnes-les-aubert.fr',
      telephone: '0662100337',
      typeDemande: 'simulateur',
      leadMagnet: 'Leads simulateur',
    });
    expect(lead.message).toContain('Budget: Entre 10k et 20k EUR');
    expect(lead.message).toContain('Réalisation proposée: Station Cardio de Ceinture Verte Urbaine');
  });

  it('accepte les champs Slack indexés sans map() et reconnaît le bot simulateur', () => {
    const params = parametresDepuisPayloadSlackMake({
      text: 'Nouveau lead AirFit : Camille Martin (Lyon)',
      blockText1: ':dart: *Nouveau lead AirFit*\n*Camille Martin* — Lyon',
      blockText2: '*Téléphone:*\n0612345678',
      blockText3: '*Email:*\ncamille@mairie-lyon.fr',
      blockText4: '*Publics visés:*\nPratiquants libres',
      blockText5: "*Site d'implantation:*\nParc & base de loisirs",
      blockText6: '*Surface:*\nEntre 200 et 250 m2',
      blockText7: '*Budget:*\nEntre 30k et 40k EUR',
      blockText8: '*Réalisation proposée:*\nProjet compatible identifié',
      botId: 'B0BFB6LGWN4',
      ts: '1790085545.920929',
    });
    const lead = leadDepuisMessageSlack(params);

    expect(params.texte).toContain('Origine : Leads simulateur');
    expect(lead).toMatchObject({
      nom: 'Camille Martin',
      ville: 'Lyon',
      email: 'camille@mairie-lyon.fr',
      telephone: '0612345678',
      segment: 'collectivite',
      typeDemande: 'simulateur',
      leadMagnet: 'Leads simulateur',
    });
    expect(lead.message).toContain("*Site d'implantation:*");
    expect(lead.message).toContain('Parc & base de loisirs');
  });

  it('rejette un payload sans contenu exploitable', () => {
    expect(() => parametresDepuisPayloadSlackMake({ channel: 'C123' })).toThrow();
  });
});
