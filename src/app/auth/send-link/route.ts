import { NextResponse } from 'next/server';
import { clientAuthServeur } from '@/lib/auth/server';
import { authConfiguree, emailAutorise } from '@/lib/auth/config';

export async function POST(request: Request) {
  if (!authConfiguree()) return NextResponse.json({ erreur: 'Connexion indisponible.' }, { status: 503 });
  const origine = request.headers.get('origin');
  if (origine !== new URL(request.url).origin) {
    return NextResponse.json({ erreur: 'Origine non autorisée.' }, { status: 403 });
  }
  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ erreur: 'Adresse e-mail requise.' }, { status: 400 });
  }
  if (typeof email !== 'string' || email.length > 254) {
    return NextResponse.json({ erreur: 'Adresse e-mail invalide.' }, { status: 400 });
  }

  // Réponse identique pour ne pas révéler les adresses autorisées.
  if (emailAutorise(email)) {
    const supabase = await clientAuthServeur();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${origine}/auth/callback`,
      },
    });
    if (error) console.error('[auth] Envoi du lien impossible :', error.message);
  }
  return NextResponse.json({ message: 'Si cette adresse est autorisée, un lien de connexion lui a été envoyé. Ouvrez-le dans ce même navigateur.' });
}
