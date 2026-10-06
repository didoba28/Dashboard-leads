/** Utilitaires sans dépendance Node, utilisables côté serveur comme dans l'UI. */

export interface DetailSlack {
  libelle: string;
  valeur: string;
}

function normaliserChamp(texte: string): string {
  return texte
    .trim()
    // Les champs Slack sont souvent encodés sous la forme `*Téléphone: *\n06…`.
    .replace(/^\s*\*{1,2}([^*\n:]+):\s*\*{1,2}\s*\n+\s*(.+)$/su, '$1: $2')
    .replace(/^\s*\*{1,2}([^*\n:]+):\*{1,2}\s*\n+\s*(.+)$/su, '$1: $2');
}

/**
 * Extrait les contenus visibles des blocks et attachments Slack, y compris les
 * anciens champs `{ title, value }` encore très utilisés par les applications.
 */
export function texteDepuisBlocsSlack(contenuSlack: unknown): string {
  const textes: string[] = [];

  function ajouter(valeur: string): void {
    const texte = normaliserChamp(valeur);
    if (texte) textes.push(texte);
  }

  function parcourir(valeur: unknown): void {
    if (Array.isArray(valeur)) {
      for (const element of valeur) parcourir(element);
      return;
    }
    if (!valeur || typeof valeur !== 'object') return;

    const objet = valeur as Record<string, unknown>;
    const titre = typeof objet['title'] === 'string' ? objet['title'].trim() : '';
    const valeurChamp = typeof objet['value'] === 'string' ? objet['value'].trim() : '';
    if (titre && valeurChamp) ajouter(`${titre.replace(/:\s*$/, '')}: ${valeurChamp}`);

    for (const [cle, contenu] of Object.entries(objet)) {
      if ((cle === 'title' || cle === 'value') && titre && valeurChamp) continue;
      if (['text', 'fallback', 'pretext', 'author_name'].includes(cle) && typeof contenu === 'string') {
        ajouter(contenu);
      } else if (contenu && typeof contenu === 'object') {
        parcourir(contenu);
      }
    }
  }

  parcourir(contenuSlack);
  return [...new Set(textes)].join('\n');
}

/** Transforme le texte Slack complet en paires lisibles pour le panneau détail. */
export function extraireDetailsSlack(texte: string): DetailSlack[] {
  const details: DetailSlack[] = [];
  const dejaVus = new Set<string>();
  const lignes = texte.split(/\r?\n/).map((ligne) => ligne.trim()).filter(Boolean);

  for (let index = 0; index < lignes.length; index++) {
    const ligne = lignes[index]!.replace(/^\*+|\*+$/g, '').trim();
    const champ = /^([^:\n]{2,60}):\s*(.*)$/u.exec(ligne);
    if (!champ || /^https?$/i.test(champ[1]!.trim())) continue;

    const libelle = champ[1]!.replace(/\*+/g, '').trim();
    let valeur = champ[2]!.replace(/^\*+|\*+$/g, '').trim();
    if (!valeur && lignes[index + 1]) {
      valeur = lignes[++index]!.replace(/^\*+|\*+$/g, '').trim();
    }
    if (!valeur) continue;

    const cle = `${libelle.toLowerCase()}\u0000${valeur.toLowerCase()}`;
    if (dejaVus.has(cle)) continue;
    dejaVus.add(cle);
    details.push({ libelle, valeur });
  }

  return details;
}
