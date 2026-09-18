'use client';

import { useState, type FormEvent } from 'react';
import { clientAuthNavigateur } from '@/lib/auth/browser';

export default function PageCompte() {
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function changerMotDePasse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setErreur('');
    if (nouveau.length < 16) {
      setErreur('Le nouveau mot de passe doit contenir au moins 16 caractères.');
      return;
    }
    if (nouveau !== confirmation) {
      setErreur('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    setEnCours(true);
    try {
      const { error } = await clientAuthNavigateur().auth.updateUser({
        current_password: actuel,
        password: nouveau,
      });
      if (error) {
        setErreur('Changement impossible. Vérifiez votre mot de passe actuel.');
        return;
      }
      setActuel('');
      setNouveau('');
      setConfirmation('');
      setMessage('Votre mot de passe a été modifié.');
    } catch {
      setErreur('Service indisponible. Réessayez.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="max-w-xl rounded-xl border border-hair bg-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-ink">Mon compte</h1>
      <p className="mt-2 text-sm text-ink-2">Changez votre mot de passe temporaire après votre première connexion. Utilisez un mot de passe unique, conservé dans un gestionnaire de mots de passe.</p>
      <form onSubmit={changerMotDePasse} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm text-ink-2" htmlFor="actuel">Mot de passe actuel</label>
          <input id="actuel" type="password" required autoComplete="current-password" value={actuel} onChange={(event) => setActuel(event.target.value)} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 text-ink" />
        </div>
        <div>
          <label className="block text-sm text-ink-2" htmlFor="nouveau">Nouveau mot de passe (16 caractères minimum)</label>
          <input id="nouveau" type="password" required minLength={16} autoComplete="new-password" value={nouveau} onChange={(event) => setNouveau(event.target.value)} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 text-ink" />
        </div>
        <div>
          <label className="block text-sm text-ink-2" htmlFor="confirmation">Confirmer le nouveau mot de passe</label>
          <input id="confirmation" type="password" required minLength={16} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 text-ink" />
        </div>
        <button type="submit" disabled={enCours} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-50">{enCours ? 'Modification…' : 'Changer le mot de passe'}</button>
      </form>
      {message && <p role="status" className="mt-4 text-sm text-ink-2">{message}</p>}
      {erreur && <p role="alert" className="mt-4 text-sm text-red-600">{erreur}</p>}
    </section>
  );
}
