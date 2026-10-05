import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authConfiguree, emailAutorise } from '@/lib/auth/config';

const ROUTES_EXTERNES = ['/api/ingest/', '/api/cron/'];
const ROUTES_PUBLIQUES = ['/connexion'];

function reponseErreurApi(message: string, statut: number) {
  return NextResponse.json({ erreur: message }, { status: statut });
}

function cheminRedirection(request: NextRequest, chemin: string) {
  return NextResponse.redirect(new URL(chemin, request.url));
}

function comparaisonConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function middleware(request: NextRequest) {
  const chemin = request.nextUrl.pathname;
  const estApi = chemin.startsWith('/api/');
  if (chemin === '/api/health' || ROUTES_EXTERNES.some((prefixe) => chemin.startsWith(prefixe))) {
    return NextResponse.next();
  }

  // La clé d'API sert aux scripts. Une requête de navigateur doit prouver son identité.
  if (estApi) {
    const attendue = process.env.API_KEY;
    const entete = request.headers.get('authorization') ?? '';
    if (attendue && entete.startsWith('Bearer ') && comparaisonConstante(entete.slice(7), attendue)) {
      return NextResponse.next();
    }
  }

  const estPublic = ROUTES_PUBLIQUES.some((route) => chemin === route || chemin.startsWith(`${route}/`));
  if (!authConfiguree()) {
    // Confort local uniquement. Un déploiement incomplet n'expose aucune donnée.
    if (process.env.NODE_ENV !== 'production') return NextResponse.next();
    return estApi
      ? reponseErreurApi('Authentification non configurée.', 503)
      : new NextResponse('Authentification non configurée.', { status: 503 });
  }

  let reponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (elements) => {
          for (const { name, value } of elements) request.cookies.set(name, value);
          reponse = NextResponse.next({ request });
          for (const { name, value, options } of elements) reponse.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getClaims();
  const identifie = !error && emailAutorise(data?.claims?.email);

  let resultat: NextResponse;
  if (estPublic) {
    resultat = chemin === '/connexion' && identifie ? cheminRedirection(request, '/') : reponse;
  } else if (!identifie) {
    resultat = estApi ? reponseErreurApi('Connexion requise.', 401) : cheminRedirection(request, '/connexion');
  } else if (chemin === '/mfa') {
    resultat = cheminRedirection(request, '/');
  } else if (estApi && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origine = request.headers.get('origin');
    resultat = origine === request.nextUrl.origin
      ? reponse
      : reponseErreurApi('Origine de la requête non autorisée.', 403);
  } else {
    resultat = reponse;
  }

  // Conserver les cookies rafraîchis même sur une redirection.
  for (const cookie of reponse.cookies.getAll()) resultat.cookies.set(cookie);
  resultat.headers.set('Cache-Control', 'private, no-store');
  return resultat;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
