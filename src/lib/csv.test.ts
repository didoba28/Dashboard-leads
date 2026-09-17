import { describe, expect, it } from 'vitest';
import {
  genererCsv,
  lignesCsvVersLeads,
  normaliserDate,
  parserCsv,
  valeurVersCle,
} from './csv';
import { LABELS_SEGMENT } from './domain/taxonomy';

describe('parserCsv — détection du séparateur', () => {
  it('détecte le point-virgule', () => {
    const { entetes, lignes } = parserCsv('nom;email\nJean Dupont;jean@test.fr');
    expect(entetes).toEqual(['nom', 'email']);
    expect(lignes).toEqual([{ nom: 'Jean Dupont', email: 'jean@test.fr' }]);
  });

  it('détecte la virgule', () => {
    const { entetes, lignes } = parserCsv('nom,email\nJean Dupont,jean@test.fr');
    expect(entetes).toEqual(['nom', 'email']);
    expect(lignes).toEqual([{ nom: 'Jean Dupont', email: 'jean@test.fr' }]);
  });

  it('détecte la tabulation', () => {
    const { entetes, lignes } = parserCsv('nom\temail\nJean Dupont\tjean@test.fr');
    expect(entetes).toEqual(['nom', 'email']);
    expect(lignes).toEqual([{ nom: 'Jean Dupont', email: 'jean@test.fr' }]);
  });

  it('un séparateur explicite ignore la détection automatique', () => {
    const { entetes } = parserCsv('nom;email\nJean;jean@test.fr', { separateur: ',' });
    // avec `,` comme séparateur, tout tient dans une seule colonne
    expect(entetes).toEqual(['nom;email']);
  });
});

describe('parserCsv — champs et cas particuliers', () => {
  it('gère un champ quoté contenant le séparateur', () => {
    const csv = 'nom;message\n"Dupont; Martin";"Bonjour"';
    const { lignes } = parserCsv(csv);
    expect(lignes[0]).toEqual({ nom: 'Dupont; Martin', message: 'Bonjour' });
  });

  it('gère un guillemet échappé (`""`)', () => {
    const csv = 'nom;message\n"Jean ""Le Grand""";"Salut"';
    const { lignes } = parserCsv(csv);
    expect(lignes[0]?.nom).toBe('Jean "Le Grand"');
  });

  it('gère un saut de ligne à l’intérieur d’un champ quoté', () => {
    const csv = 'nom;message\n"Jean";"Ligne 1\nLigne 2"';
    const { lignes } = parserCsv(csv);
    expect(lignes[0]?.message).toBe('Ligne 1\nLigne 2');
  });

  it('gère les fins de ligne \\r\\n', () => {
    const csv = 'nom;email\r\nJean;jean@test.fr\r\nMarie;marie@test.fr';
    const { lignes } = parserCsv(csv);
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toEqual({ nom: 'Marie', email: 'marie@test.fr' });
  });

  it('retire le BOM UTF-8 en tête de fichier', () => {
    const csv = '﻿nom;email\nJean;jean@test.fr';
    const { entetes } = parserCsv(csv);
    expect(entetes[0]).toBe('nom');
  });

  it('ignore les lignes entièrement vides', () => {
    const csv = 'nom;email\nJean;jean@test.fr\n\nMarie;marie@test.fr\n';
    const { lignes } = parserCsv(csv);
    expect(lignes).toHaveLength(2);
  });
});

describe('genererCsv', () => {
  it('préfixe un BOM UTF-8 et sépare par `;`', () => {
    const csv = genererCsv([{ nom: 'Dupont' }], [{ cle: 'nom', label: 'Nom' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Nom\r\nDupont');
  });

  it('échappe les champs contenant le séparateur ou un guillemet', () => {
    const csv = genererCsv(
      [{ nom: 'Dupont; Martin', citation: 'il a dit "bonjour"' }],
      [
        { cle: 'nom', label: 'Nom' },
        { cle: 'citation', label: 'Citation' },
      ],
    );
    expect(csv).toContain('"Dupont; Martin"');
    expect(csv).toContain('"il a dit ""bonjour"""');
  });

  it('convertit les booléens en oui/non', () => {
    const csv = genererCsv(
      [{ actif: true, archive: false }],
      [
        { cle: 'actif', label: 'Actif' },
        { cle: 'archive', label: 'Archivé' },
      ],
    );
    expect(csv).toContain('oui;non');
  });

  it('convertit les nombres en notation décimale française', () => {
    const csv = genererCsv([{ points: 0.5 }], [{ cle: 'points', label: 'Points' }]);
    expect(csv).toContain('0,5');
  });

  it('convertit null/undefined en champ vide', () => {
    const csv = genererCsv(
      [{ a: null, b: undefined }],
      [
        { cle: 'a', label: 'A' },
        { cle: 'b', label: 'B' },
      ],
    );
    const lignes = csv.slice(1).split('\r\n');
    expect(lignes[1]).toBe(';');
  });
});

describe('normaliserDate', () => {
  it('accepte YYYY-MM-DD', () => {
    expect(normaliserDate('2026-10-14')).toBe('2026-10-14');
  });

  it('accepte DD/MM/YYYY', () => {
    expect(normaliserDate('14/10/2026')).toBe('2026-10-14');
  });

  it('accepte DD-MM-YYYY', () => {
    expect(normaliserDate('14-10-2026')).toBe('2026-10-14');
  });

  it('accepte une date ISO complète', () => {
    expect(normaliserDate('2026-10-14T08:30:00.000Z')).toBe('2026-10-14');
  });

  it('rejette une date impossible', () => {
    expect(normaliserDate('32/01/2026')).toBeNull();
  });

  it('rejette une chaîne illisible', () => {
    expect(normaliserDate('pas une date')).toBeNull();
  });
});

describe('valeurVersCle', () => {
  it('retrouve la clé technique à partir de la clé elle-même', () => {
    expect(valeurVersCle('b2b', LABELS_SEGMENT)).toBe('b2b');
  });

  it('retrouve la clé technique à partir d’un libellé accentué, insensible à la casse', () => {
    expect(valeurVersCle('collectivité', LABELS_SEGMENT)).toBe('collectivite');
    expect(valeurVersCle('COLLECTIVITÉ', LABELS_SEGMENT)).toBe('collectivite');
  });

  it('renvoie null si la valeur est introuvable', () => {
    expect(valeurVersCle('inconnu', LABELS_SEGMENT)).toBeNull();
  });
});

describe('lignesCsvVersLeads', () => {
  const csv = [
    'Date de réception;Nom;E-mail;Segment;Type de demande;Tags',
    '2026-10-05;Jean Dupont;jean@mairie-test.fr;Collectivité;Fiche technique;plan5000,urgent',
    '2026-10-06;Marie Curie;marie@test.fr;Galaxie;Livre blanc;',
  ].join('\n');

  it('mappe une ligne valide et signale la ligne fautive avec son numéro et sa valeur', () => {
    const { lignes } = parserCsv(csv);
    const { valides, erreurs } = lignesCsvVersLeads(lignes);

    expect(valides).toHaveLength(1);
    expect(valides[0]).toMatchObject({
      dateReception: '2026-10-05',
      nom: 'Jean Dupont',
      email: 'jean@mairie-test.fr',
      segment: 'collectivite',
      typeDemande: 'fiche_technique',
      tags: ['plan5000', 'urgent'],
    });

    expect(erreurs).toHaveLength(1);
    expect(erreurs[0]?.ligne).toBe(2);
    expect(erreurs[0]?.message).toContain('Galaxie');
  });
});
