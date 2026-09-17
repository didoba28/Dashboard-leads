import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  evenementSlackExploitable,
  extraireUrlSlack,
  leadDepuisMessageSlack,
  nettoyerTexteSlack,
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
  });
});
