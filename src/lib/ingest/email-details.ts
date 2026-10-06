export interface DetailsFormulaireEmail {
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  ville: string | null;
  message: string | null;
  origine: string | null;
}

const ETIQUETTES = [
  'Nom & Prénom',
  'Nom et prénom',
  'Prénom',
  'Nom',
  'Adresse e-mail',
  'Email',
  'E-mail',
  'Numéro de téléphone',
  'Téléphone',
  'Ville',
  'Message',
  "D'où connaissez-vous AirFit ?",
] as const;

function normaliserLibelle(libelle: string): string {
  return libelle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

const CLES: Record<string, keyof DetailsFormulaireEmail> = {
  nomprenom: 'nom',
  nometprenom: 'nom',
  prenom: 'prenom',
  nom: 'nom',
  adresseemail: 'email',
  email: 'email',
  numerodetelephone: 'telephone',
  telephone: 'telephone',
  ville: 'ville',
  message: 'message',
  douconnaissezvousairfit: 'origine',
};

/** Extrait les champs utiles d'une notification Webflow transférée par e-mail. */
export function extraireDetailsFormulaireEmail(corps: string): DetailsFormulaireEmail | null {
  const valeurs: DetailsFormulaireEmail = {
    prenom: null,
    nom: null,
    email: null,
    telephone: null,
    ville: null,
    message: null,
    origine: null,
  };

  const motifEtiquette = ETIQUETTES.map((etiquette) => etiquette.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const lignes = corps
    .replace(/\r/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Ne pas couper « Nom & Prénom » juste avant le mot « Prénom ».
    .replace(new RegExp(`(?<!&)\\s+(?=(?:${motifEtiquette})\\s*:)`, 'gi'), '\n')
    .split('\n');

  let cleCourante: keyof DetailsFormulaireEmail | null = null;

  for (const ligneBrute of lignes) {
    const ligne = ligneBrute.trim();
    const champ = new RegExp(`^(${motifEtiquette})\\s*:\\s*(.*)$`, 'i').exec(ligne);

    if (champ) {
      cleCourante = CLES[normaliserLibelle(champ[1] ?? '')] ?? null;
      if (cleCourante) valeurs[cleCourante] = (champ[2] ?? '').trim() || null;
      continue;
    }

    if (!cleCourante || !ligne) continue;
    if (/^-{10,}$/.test(ligne) || /^(if you believe|unsubscribe\b)/i.test(ligne)) {
      cleCourante = null;
      continue;
    }

    // Le message est le seul champ qui peut naturellement occuper plusieurs lignes.
    if (cleCourante === 'message') {
      valeurs.message = [valeurs.message, ligne].filter(Boolean).join('\n');
    }
  }

  return Object.values(valeurs).some(Boolean) ? valeurs : null;
}
