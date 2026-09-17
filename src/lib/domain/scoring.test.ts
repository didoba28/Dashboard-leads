import { describe, expect, it } from 'vitest';
import { REGLES, scorerLead, type EntreeScoring } from './scoring';
import { INITIATIVES, RELATIONS, SEGMENTS, TYPES_DEMANDE } from './taxonomy';

const base: EntreeScoring = {
  segment: 'b2b',
  relation: 'prospect',
  typeDemande: 'formulaire_contact',
  initiative: 'inbound_site',
};

describe('exclusions', () => {
  it('exclut un renouvellement client', () => {
    const r = scorerLead({ ...base, typeDemande: 'renouvellement_client' });
    expect(r.eligible).toBe(false);
    expect(r.points).toBe(0);
    expect(r.regleId).toBe('exclusion.renouvellement');
  });

  it('exclut un distributeur qui télécharge une fiche technique', () => {
    const r = scorerLead({ ...base, relation: 'distributeur', typeDemande: 'fiche_technique' });
    expect(r.eligible).toBe(false);
    expect(r.points).toBe(0);
    expect(r.regleId).toBe('exclusion.distributeur');
  });

  it('exclut un distributeur quel que soit le type de demande', () => {
    for (const typeDemande of TYPES_DEMANDE) {
      expect(scorerLead({ ...base, relation: 'distributeur', typeDemande }).points).toBe(0);
    }
  });

  it('exclut un compte déjà client', () => {
    const r = scorerLead({ ...base, relation: 'client', typeDemande: 'fiche_technique' });
    expect(r.eligible).toBe(false);
    expect(r.regleId).toBe('exclusion.client');
  });

  it("l'exclusion prime sur l'initiative outbound", () => {
    const r = scorerLead({ ...base, relation: 'client', initiative: 'outbound_campagne' });
    expect(r.points).toBe(0);
    expect(r.eligibleActivation).toBe(false);
  });
});

describe('initiative outbound', () => {
  it('compte 0,5 point pour un lead magnet servi par une campagne mailing', () => {
    const r = scorerLead({
      ...base,
      typeDemande: 'livre_blanc',
      initiative: 'outbound_campagne',
    });
    expect(r.eligible).toBe(true);
    expect(r.points).toBe(0.5);
  });

  it("n'alimente jamais les activations inbound", () => {
    for (const initiative of ['outbound_campagne', 'outbound_bdr'] as const) {
      for (const segment of SEGMENTS) {
        const r = scorerLead({ ...base, segment, initiative });
        expect(r.points).toBe(0.5);
        expect(r.eligibleActivation).toBe(false);
      }
    }
  });
});

describe('initiative newsletter', () => {
  it('compte 1 point plein', () => {
    const r = scorerLead({ ...base, typeDemande: 'livre_blanc', initiative: 'newsletter' });
    expect(r.points).toBe(1);
    expect(r.eligibleActivation).toBe(true);
    expect(r.regleId).toBe('newsletter.lead_magnet');
  });

  it('vaut deux fois le même lead magnet servi en outbound', () => {
    const newsletter = scorerLead({ ...base, typeDemande: 'catalogue', initiative: 'newsletter' });
    const outbound = scorerLead({ ...base, typeDemande: 'catalogue', initiative: 'outbound_bdr' });
    expect(newsletter.points).toBe(outbound.points * 2);
  });

  it('arbitrage B2C : `newsletter` (défaut) donne 1 point', () => {
    expect(scorerLead({ ...base, segment: 'b2c', initiative: 'newsletter' }).points).toBe(1);
  });

  it('arbitrage B2C : `segment` redonne la main à la grille de points', () => {
    const r = scorerLead(
      { ...base, segment: 'b2c', initiative: 'newsletter' },
      { arbitrageB2cNewsletter: 'segment' },
    );
    expect(r.points).toBe(0.5);
    expect(r.regleId).toBe('inbound.b2c');
  });
});

describe('grille de points inbound', () => {
  it('formulaire B2B prospect = 1 point', () => {
    expect(scorerLead({ ...base, typeDemande: 'demande_prix' }).points).toBe(1);
  });

  it('fiche technique prospect B2B non client = 1 point', () => {
    expect(scorerLead({ ...base, typeDemande: 'fiche_technique' }).points).toBe(1);
  });

  it('fiche technique collectivité non cliente = 1 point', () => {
    const r = scorerLead({ ...base, segment: 'collectivite', typeDemande: 'fiche_technique' });
    expect(r.points).toBe(1);
    expect(r.eligible).toBe(true);
  });

  it('formulaire B2C = 0,5 point', () => {
    expect(scorerLead({ ...base, segment: 'b2c', typeDemande: 'formulaire_contact' }).points).toBe(0.5);
  });

  it('livre blanc, catalogue, simulateur et appel entrant depuis le site = 1 point en B2B', () => {
    for (const typeDemande of ['livre_blanc', 'catalogue', 'simulateur', 'appel_entrant'] as const) {
      expect(scorerLead({ ...base, typeDemande }).points).toBe(1);
    }
  });
});

describe('robustesse du moteur', () => {
  it('produit un résultat pour toutes les combinaisons de la taxonomie', () => {
    let n = 0;
    for (const segment of SEGMENTS) {
      for (const relation of RELATIONS) {
        for (const typeDemande of TYPES_DEMANDE) {
          for (const initiative of INITIATIVES) {
            const r = scorerLead({ segment, relation, typeDemande, initiative });
            expect([0, 0.5, 1]).toContain(r.points);
            expect(r.regleId).not.toBe('');
            if (!r.eligible) expect(r.points).toBe(0);
            if (!r.eligible) expect(r.eligibleActivation).toBe(false);
            n++;
          }
        }
      }
    }
    expect(n).toBe(SEGMENTS.length * RELATIONS.length * TYPES_DEMANDE.length * INITIATIVES.length);
  });

  it('les identifiants de règles sont uniques', () => {
    const ids = REGLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('la dernière règle est un filet de sécurité', () => {
    expect(REGLES[REGLES.length - 1]!.test(base, { arbitrageB2cNewsletter: 'newsletter' })).toBe(true);
  });
});
