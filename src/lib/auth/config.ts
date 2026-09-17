/** Configuration de l'authentification, évaluée uniquement à l'exécution. */
export function authConfiguree(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !process.env.DASHBOARD_ALLOWED_EMAILS) return false;
  try {
    const protocole = new URL(url).protocol;
    return protocole === 'https:' || (process.env.NODE_ENV !== 'production' && protocole === 'http:');
  } catch {
    return false;
  }
}

export function emailAutorise(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const adresses = process.env.DASHBOARD_ALLOWED_EMAILS?.split(',')
    .map((valeur) => valeur.trim().toLowerCase())
    .filter(Boolean) ?? [];
  return adresses.includes(email.trim().toLowerCase());
}
