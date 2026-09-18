'use client';

import { useState, type FormEvent } from 'react';
import { clientAuthNavigateur } from '@/lib/auth/browser';

export default function PageConnexion() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function connecter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnCours(true);
    setErreur('');
    try {
      const { error } = await clientAuthNavigateur().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: motDePasse,
      });
      if (error) {
        setErreur('Adresse e-mail ou mot de passe incorrect.');
        return;
      }
      window.location.replace('/mfa');
    } catch {
      setErreur('Connexion indisponible. Réessayez.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="mx-auto mt-12 max-w-md rounded-xl border border-hair bg-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-ink">Connexion au dashboard</h1>
      <p className="mt-2 text-sm text-ink-2">Connectez-vous avec votre adresse autorisée et votre mot de passe. Le code de votre application d’authentification sera ensuite demandé.</p>
      <form onSubmit={connecter} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm text-ink-2" htmlFor="email">Adresse e-mail</label>
          <input id="email" type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 text-ink" />
        </div>
        <div>
          <label className="block text-sm text-ink-2" htmlFor="mot-de-passe">Mot de passe</label>
          <input id="mot-de-passe" type="password" required autoComplete="current-password" value={motDePasse} onChange={(event) => setMotDePasse(event.target.value)} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 text-ink" />
        </div>
        <button type="submit" disabled={enCours} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-50">{enCours ? 'Connexion…' : 'Se connecter'}</button>
      </form>
      {erreur && <p role="alert" className="mt-4 text-sm text-red-600">{erreur}</p>}
    </section>
  );
}
