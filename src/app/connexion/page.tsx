'use client';

import { useState, type FormEvent } from 'react';
import { clientAuthNavigateur } from '@/lib/auth/browser';

export default function PageConnexion() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function connecter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnCours(true);
    setErreur('');
    try {
      const { error } = await clientAuthNavigateur().auth.signInWithPassword({
        email,
        password: code,
      });
      if (error) {
        setErreur('Personne ou code incorrect.');
        return;
      }
      window.location.replace('/');
    } catch {
      setErreur('Connexion indisponible. Réessayez.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="mx-auto mt-12 max-w-md rounded-xl border border-hair bg-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-ink">Connexion au dashboard</h1>
      <p className="mt-2 text-sm text-ink-2">Choisissez votre nom et saisissez le code d’accès.</p>
      <form onSubmit={connecter} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm text-ink-2" htmlFor="personne">Personne</label>
          <select id="personne" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 text-ink">
            <option value="">Choisir…</option>
            <option value="adel@airfit.co">Adel</option>
            <option value="mehdi@airfit.co">Mehdi</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-ink-2" htmlFor="code">Code d’accès</label>
          <input id="code" type="password" required autoComplete="current-password" value={code} onChange={(event) => setCode(event.target.value)} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 text-ink" />
        </div>
        <button type="submit" disabled={enCours} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-50">{enCours ? 'Connexion…' : 'Se connecter'}</button>
      </form>
      {erreur && <p role="alert" className="mt-4 text-sm text-red-600">{erreur}</p>}
    </section>
  );
}
