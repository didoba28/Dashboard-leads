import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function clientAuthServeur() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !cle) throw new Error('La connexion Supabase n’est pas configurée.');
  const magasin = await cookies();
  return createServerClient(url, cle, {
    cookies: {
      getAll: () => magasin.getAll(),
      setAll: (elements) => {
        for (const { name, value, options } of elements) magasin.set(name, value, options);
      },
    },
  });
}
