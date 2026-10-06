import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { filtresDepuisUrl, gererErreur } from './http';

const url = (query: string) => new URL(`https://dashboard.test/api/leads?${query}`);

describe('Validation des filtres de leads', () => {
  it('accepte les filtres fermés, les listes répétées et une plage réelle inclusive', () => {
    expect(filtresDepuisUrl(url('segment=b2b,collectivite&segment=association&segment=b2b&dateDebut=2026-09-27&dateFin=2026-10-06&pointsConfirmes=1&pointsExclus=0&limite=50&offset=100&tri=date_asc'))).toMatchObject({
      segment: ['b2b', 'collectivite', 'association'],
      dateDebut: '2026-09-27', dateFin: '2026-10-06',
      pointsConfirmes: true, pointsExclus: false, limite: 50, offset: 100, tri: 'date_asc',
    });
  });

  it('accepte toutes périodes et la période d’activation indépendante', () => {
    expect(filtresDepuisUrl(url('periode=toutes&periodeActivation=2026-Q4&opportunitesInbound=true&dateDebut='))).toMatchObject({
      periode: undefined, periodeActivation: '2026-Q4', opportunitesInbound: true, dateDebut: undefined,
    });
  });

  it.each([
    'dateDebut=2026-02-30', 'dateDebut=06/10/2026',
    'dateDebut=2026-10-06&dateFin=2026-09-27',
    'periode=2026-Q4&dateDebut=2027-01-01',
    'periodeActivation=2026-Q5', 'periode=2026-Q5',
    'limite=abc', 'limite=Infinity', 'limite=0', 'limite=1001', 'limite=1.5',
    'offset=-1', 'offset=1.5', 'offset=9007199254740992',
    'tri=aleatoire', 'segment=b2b,inexistant', 'statut=inexistant',
    'initiative=inexistant', 'sourceCollecte=inexistant', 'typeDemande=inexistant',
    'pointsConfirmes=peut-etre', 'pointsExclus=peut-etre',
  ])('refuse un filtre invalide sans élargir silencieusement la sélection : %s', (query) => {
    expect(() => filtresDepuisUrl(url(query))).toThrow(ZodError);
  });

  it('retourne une erreur 422 avec le champ concerné', async () => {
    try {
      filtresDepuisUrl(url('limite=abc'));
      throw new Error('Le filtre aurait dû être refusé');
    } catch (err) {
      const reponse = gererErreur(err);
      expect(reponse.status).toBe(422);
      expect(await reponse.json()).toMatchObject({ erreur: 'Données invalides', details: [{ champ: 'limite' }] });
    }
  });
});
