'use client';

import { createBrowserClient } from '@supabase/ssr';

export function clientAuthNavigateur() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !cle) throw new Error('La connexion Supabase n’est pas configurée.');
  return createBrowserClient(url, cle);
}
