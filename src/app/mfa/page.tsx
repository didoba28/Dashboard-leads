'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { clientAuthNavigateur } from '@/lib/auth/browser';

type Facteur = { id: string; qr: string; secret: string };

export default function PageMfa() {
  const [facteur, setFacteur] = useState<Facteur | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);
  const [verification, setVerification] = useState(false);

  useEffect(() => {
    let actif = true;
    async function preparer() {
      try {
        const supabase = clientAuthNavigateur();
        const { data: niveau, error: erreurNiveau } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (erreurNiveau) throw erreurNiveau;
        if (niveau.currentLevel === 'aal2') {
          window.location.replace('/');
          return;
        }
        const { data: facteurs, error: erreurFacteurs } = await supabase.auth.mfa.listFactors();
        if (erreurFacteurs) throw erreurFacteurs;
        const existant = facteurs.totp[0];
        if (existant) {
          if (actif) setFacteur({ id: existant.id, qr: '', secret: '' });
        } else {
          // Une page rechargée peut avoir laissé un facteur incomplet.
          for (const ancien of facteurs.all.filter((item) => item.factor_type === 'totp' && item.status === 'unverified')) {
            const { error: erreurSuppression } = await supabase.auth.mfa.unenroll({ factorId: ancien.id });
            if (erreurSuppression) throw erreurSuppression;
          }
          const { data: inscription, error: erreurInscription } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Dashboard leads' });
          if (erreurInscription) throw erreurInscription;
          if (actif) {
            setFacteur({ id: inscription.id, qr: inscription.totp.qr_code, secret: inscription.totp.secret });
            setNouveau(true);
          }
        }
      } catch (cause) {
        if (actif) setErreur(cause instanceof Error ? cause.message : 'Vérification indisponible.');
      } finally {
        if (actif) setChargement(false);
      }
    }
    void preparer();
    return () => { actif = false; };
  }, []);

  async function verifier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!facteur) return;
    setVerification(true);
    setErreur('');
    try {
      const supabase = clientAuthNavigateur();
      const { data: defi, error: erreurDefi } = await supabase.auth.mfa.challenge({ factorId: facteur.id });
      if (erreurDefi) throw erreurDefi;
      const { error: erreurCode } = await supabase.auth.mfa.verify({ factorId: facteur.id, challengeId: defi.id, code: code.trim() });
      if (erreurCode) throw erreurCode;
      window.location.replace('/');
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Code invalide.');
      setVerification(false);
    }
  }

  return (
    <section className="mx-auto mt-12 max-w-md rounded-xl border border-hair bg-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-ink">Vérification à deux facteurs</h1>
      {chargement && <p className="mt-3 text-sm text-ink-2">Préparation…</p>}
      {nouveau && facteur && (
        <div className="mt-4 space-y-3 text-sm text-ink-2">
          <p>Scannez ce QR code avec une application d’authentification, puis saisissez le code à six chiffres.</p>
          {/* Le QR code ne quitte pas le navigateur ; il contient le secret TOTP. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/svg+xml;utf-8,${encodeURIComponent(facteur.qr)}`} alt="QR code de configuration de l’authentification" className="h-44 w-44 rounded bg-white p-2" />
          <p>Si vous ne pouvez pas le scanner : <code className="break-all text-ink">{facteur.secret}</code></p>
        </div>
      )}
      {!nouveau && facteur && <p className="mt-3 text-sm text-ink-2">Saisissez le code de votre application d’authentification.</p>}
      {facteur && (
        <form onSubmit={verifier} className="mt-5 space-y-4">
          <label htmlFor="code" className="block text-sm text-ink-2">Code à six chiffres</label>
          <input id="code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} className="w-full rounded-lg border border-hair bg-surface px-3 py-2 text-ink" />
          <button type="submit" disabled={verification} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-50">{verification ? 'Vérification…' : 'Valider'}</button>
        </form>
      )}
      {erreur && <p role="alert" className="mt-4 text-sm text-red-600">{erreur}</p>}
      <button type="button" onClick={async () => { await clientAuthNavigateur().auth.signOut(); window.location.replace('/connexion'); }} className="mt-6 text-sm text-ink-2 underline">Se déconnecter</button>
    </section>
  );
}
