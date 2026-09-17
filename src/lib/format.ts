/** Formatage d'affichage — partagé entre composants serveur et client. */

export function formaterPoints(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

export function formaterEuros(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

/** `2026-10-05` → `05/10/2026`. */
export function formaterDate(iso: string): string {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

/** `2026-10-05` → `05/10/26`. */
export function formaterDateCourte(iso: string): string {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a?.slice(2)}`;
}

export function formaterDateHeure(iso: string | null): string {
  if (!iso) return 'jamais';
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}
