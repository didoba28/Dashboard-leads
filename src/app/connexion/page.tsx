'use client';

import { useState, type FormEvent } from 'react';

export default function PageConnexion() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function envoyer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnCours(true);
    setMessage('');
    try {
      const reponse = await fetch('/auth/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const resultat = await reponse.json() as { message?: string; erreur?: string };
      setMessage(resultat.message ?? resultat.erreur ?? 'Envoi impossible.');
    } catch {
      setMessage('Connexion au service impossible. Réessayez.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="mx-auto mt-12 max-w-md rounded-xl border border-hair bg-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-ink">Connexion au dashboard</h1>
      <p className="mt-2 text-sm text-ink-2">Saisissez votre adresse autorisée. Un lien de connexion vous sera envoyé, puis un code de votre application d’authentification sera demandé.</p>
      <form onSubmit={envoyer} className="mt-6 space-y-4">
        <label className="block text-sm text-ink-2" htmlFor="email">Adresse e-mail</label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-hair bg-surface px-3 py-2 text-ink" />
        <button type="submit" disabled={enCours} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-50">{enCours ? 'Envoi…' : 'Recevoir un lien'}</button>
      </form>
      {message && <p role="status" className="mt-4 text-sm text-ink-2">{message}</p>}
    </section>
  );
}
