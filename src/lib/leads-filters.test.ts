import { describe, expect, it } from 'vitest';
import { construireQueryLeads, filtresPourDepot, lireFiltresVue } from './leads-filters';

describe('liens partageables du registre', () => {
  it('conserve les filtres et la fiche précise après un aller-retour URL', () => {
    const source = new URLSearchParams('periode=2026-Q4&segment=collectivite,association&pointsConfirmes=false&sourceCollecte=slack_inbound&offset=50&leadId=1593f606-d51d-4ed0-a950-7649a56a261b&q=Ville');
    const initial = lireFiltresVue(source);
    const retrouve = lireFiltresVue(new URLSearchParams(construireQueryLeads(initial.filtres, initial.offset, { leadId: initial.leadId })));
    expect(retrouve).toEqual(initial);
  });

  it('traduit le KPI opportunités sans perdre sa qualification ni la période d’activation', () => {
    const initial = lireFiltresVue(new URLSearchParams('periodeActivation=2026-Q4&opportunitesInbound=true'));
    expect(filtresPourDepot(initial.filtres)).toMatchObject({ periodeActivation: '2026-Q4', opportunitesInbound: true });
    expect(construireQueryLeads(initial.filtres)).toContain('opportunitesInbound=true');
  });

  it('les exclusions ne sont pas confondues avec les décisions à confirmer', () => {
    const { filtres } = lireFiltresVue(new URLSearchParams('pointsExclus=true&aConfirmer=true'));
    expect(filtresPourDepot(filtres)).toMatchObject({ pointsExclus: true, pointsConfirmes: true });
    expect(filtres.aConfirmer).toBe(false);
  });

  it('neutralise les identifiants et dates impossibles d’un lien externe', () => {
    const lecture = lireFiltresVue(new URLSearchParams('dateDebut=2026-02-31&segment=inexistant&offset=NaN&leadId=nimporte-quoi'));
    expect(lecture.leadId).toBeNull();
    expect(lecture.offset).toBe(0);
    expect(lecture.filtres.dateDebut).toBe('');
    expect(lecture.filtres.segment).toBe('');
  });
});
