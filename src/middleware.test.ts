import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';
import { emailAutorise } from './lib/auth/config';

const etatAuth = vi.hoisted(() => ({ email: '' as string | undefined, aal: 'aal1' }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: etatAuth.email ? { claims: { email: etatAuth.email, aal: etatAuth.aal } } : null, error: null }) },
  }),
}));

afterEach(() => vi.unstubAllEnvs());

function configurerAuth() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubEnv('DASHBOARD_ALLOWED_EMAILS', 'adel@exemple.fr');
}

describe('accès au dashboard', () => {
  it('ferme pages et API si Supabase Auth manque en production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('DASHBOARD_ALLOWED_EMAILS', '');
    const page = await middleware(new NextRequest('https://leads.example.com/leads'));
    const api = await middleware(new NextRequest('https://leads.example.com/api/leads', {
      headers: { 'sec-fetch-site': 'same-origin' },
    }));
    expect(page.status).toBe(503);
    expect(api.status).toBe(503);
  });

  it('autorise une clé API seulement dans Authorization: Bearer', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('API_KEY', 'une-cle-de-test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('DASHBOARD_ALLOWED_EMAILS', '');
    const autorise = await middleware(new NextRequest('https://leads.example.com/api/leads', {
      headers: { authorization: 'Bearer une-cle-de-test' },
    }));
    const url = await middleware(new NextRequest('https://leads.example.com/api/leads?cle=une-cle-de-test'));
    expect(autorise.status).toBe(200);
    expect(url.status).toBe(503);
  });

  it('compare les adresses exactes sans tenir compte de la casse', () => {
    vi.stubEnv('DASHBOARD_ALLOWED_EMAILS', ' Adel@exemple.fr, mehdi@exemple.fr ');
    expect(emailAutorise('adel@EXEMPLE.fr')).toBe(true);
    expect(emailAutorise('autre@exemple.fr')).toBe(false);
  });

  it('refuse un compte non autorisé et exige le deuxième facteur', async () => {
    configurerAuth();
    etatAuth.email = 'autre@exemple.fr';
    etatAuth.aal = 'aal2';
    const exclu = await middleware(new NextRequest('https://leads.example.com/leads'));
    expect(exclu.headers.get('location')).toBe('https://leads.example.com/connexion');

    etatAuth.email = 'adel@exemple.fr';
    etatAuth.aal = 'aal1';
    const mfa = await middleware(new NextRequest('https://leads.example.com/leads'));
    const api = await middleware(new NextRequest('https://leads.example.com/api/leads'));
    expect(mfa.headers.get('location')).toBe('https://leads.example.com/mfa');
    expect(api.status).toBe(403);
  });

  it('accepte une session aal2 et bloque une écriture cross-origin', async () => {
    configurerAuth();
    etatAuth.email = 'adel@exemple.fr';
    etatAuth.aal = 'aal2';
    const page = await middleware(new NextRequest('https://leads.example.com/leads'));
    const mutation = await middleware(new NextRequest('https://leads.example.com/api/leads', {
      method: 'POST', headers: { origin: 'https://attaquant.example.com' },
    }));
    expect(page.status).toBe(200);
    expect(mutation.status).toBe(403);
  });
});
