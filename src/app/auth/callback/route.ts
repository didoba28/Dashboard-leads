import { NextResponse, type NextRequest } from 'next/server';
import { clientAuthServeur } from '@/lib/auth/server';
import { emailAutorise } from '@/lib/auth/config';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/connexion?erreur=lien', request.url));

  const supabase = await clientAuthServeur();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/connexion?erreur=lien', request.url));

  const { data, error: erreurIdentite } = await supabase.auth.getClaims();
  if (erreurIdentite || !emailAutorise(data?.claims?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/connexion?erreur=acces', request.url));
  }
  return NextResponse.redirect(new URL('/mfa', request.url));
}
