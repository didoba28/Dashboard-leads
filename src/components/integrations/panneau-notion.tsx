'use client';

/** Connexion et synchronisation Notion. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Bouton, Carte, Champ, EnteteCarte, Entree } from '@/components/ui/primitives';
import { useToasts } from '@/components/ui/toast';
import type { EtatNotion } from '@/lib/notion/sync';
import { formaterDateHeure } from '@/lib/format';

export function PanneauNotion({ etat }: { etat: EtatNotion }) {
  const [databaseId, setDatabaseId] = useState(etat.databaseId ?? '');
  const [parentPageId, setParentPageId] = useState('');
  const [enCours, setEnCours] = useState<'setup' | 'sync' | 'pull' | 'push' | null>(null);
  const { notifier } = useToasts();
  const router = useRouter();

  async function appeler(url: string, corps?: unknown, action?: typeof enCours) {
    setEnCours(action ?? null);
    try {
      const reponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps ?? {}),
      });
      const data = await reponse.json();
      if (!reponse.ok) throw new Error(data?.erreur ?? 'Opération impossible');
      return data;
    } finally {
      setEnCours(null);
    }
  }

  async function connecter() {
    try {
      const data = await appeler(
        '/api/notion/setup',
        {
          ...(databaseId.trim() ? { databaseId: databaseId.trim() } : {}),
          ...(parentPageId.trim() ? { parentPageId: parentPageId.trim() } : {}),
        },
        'setup',
      );
      notifier({
        ton: 'succes',
        titre: data.cree ? 'Base Notion créée' : 'Base Notion rattachée',
        detail:
          data.proprietesAjoutees.length > 0
            ? `${data.proprietesAjoutees.length} propriété(s) ajoutée(s).`
            : 'Toutes les propriétés étaient déjà présentes.',
      });
      router.refresh();
    } catch (err) {
      notifier({ ton: 'erreur', titre: 'Connexion impossible', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  async function synchroniser(direction?: 'pull' | 'push') {
    try {
      const data = await appeler(
        `/api/notion/sync${direction ? `?direction=${direction}` : ''}`,
        {},
        direction ?? 'sync',
      );
      notifier({
        ton: data.erreurs.length > 0 ? 'info' : 'succes',
        titre: `Synchronisation : ${data.crees} créé(s), ${data.maj} mis à jour`,
        detail:
          data.erreurs.length > 0
            ? `${data.erreurs.length} erreur(s) — voir le journal.`
            : `${data.ignores} inchangé(s), en ${Math.round(data.dureeMs / 100) / 10} s.`,
      });
      router.refresh();
    } catch (err) {
      notifier({
        ton: 'erreur',
        titre: 'Synchronisation impossible',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <Carte>
      <EnteteCarte
        titre="Notion"
        sousTitre="Synchronisation bidirectionnelle : le dashboard calcule les points, Notion reste l’espace de travail"
        action={
          etat.configure ? (
            <Badge ton={etat.databaseId ? 'bon' : 'attention'}>
              {etat.databaseId ? 'Connecté' : 'Jeton présent, base à connecter'}
            </Badge>
          ) : (
            <Badge ton="neutre">Non configuré</Badge>
          )
        }
      />
      <div className="space-y-4 px-5 pb-5">
        {!etat.configure ? (
          <div className="rounded-lg border border-hair bg-surface-2 px-3.5 py-3 text-xs text-ink-2">
            <p className="font-medium text-ink">Étape 1 — créer l’intégration Notion</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>
                Créez une intégration interne sur{' '}
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--s1)] underline-offset-2 hover:underline"
                >
                  notion.so/my-integrations
                </a>
                .
              </li>
              <li>
                Copiez le jeton secret dans <code className="rounded bg-surface px-1">NOTION_TOKEN</code> du fichier{' '}
                <code className="rounded bg-surface px-1">.env.local</code>, puis redémarrez l’application.
              </li>
              <li>Partagez la page Notion parente avec cette intégration.</li>
            </ol>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Champ
            label="ID de base existante"
            aide="Laissez vide pour créer une nouvelle base"
          >
            <Entree
              value={databaseId}
              onChange={(e) => setDatabaseId(e.target.value)}
              placeholder="278a1b2c3d4e5f60…"
              disabled={!etat.configure}
            />
          </Champ>
          <Champ label="ID de la page parente" aide="Requis pour créer la base">
            <Entree
              value={parentPageId}
              onChange={(e) => setParentPageId(e.target.value)}
              placeholder="Page où créer la base"
              disabled={!etat.configure}
            />
          </Champ>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Bouton onClick={connecter} enCours={enCours === 'setup'} disabled={!etat.configure}>
            {etat.databaseId ? 'Vérifier / compléter la base' : 'Connecter la base'}
          </Bouton>
          <Bouton
            variante="principal"
            onClick={() => synchroniser()}
            enCours={enCours === 'sync'}
            disabled={!etat.configure || !etat.databaseId}
          >
            Synchroniser maintenant
          </Bouton>
          <Bouton
            taille="petit"
            onClick={() => synchroniser('pull')}
            enCours={enCours === 'pull'}
            disabled={!etat.configure || !etat.databaseId}
          >
            Notion → Dashboard
          </Bouton>
          <Bouton
            taille="petit"
            onClick={() => synchroniser('push')}
            enCours={enCours === 'push'}
            disabled={!etat.configure || !etat.databaseId}
          >
            Dashboard → Notion
          </Bouton>
        </div>

        <dl className="grid grid-cols-2 gap-3 border-t border-hair pt-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-ink-muted">Dernière descente</dt>
            <dd className="mt-0.5 text-ink">{formaterDateHeure(etat.dernierPull)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">En attente d’envoi</dt>
            <dd className="mt-0.5 text-ink tabulaire">{etat.enAttenteDePush} lead(s)</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-ink-muted">Base</dt>
            <dd className="mt-0.5 truncate text-ink" title={etat.databaseId ?? ''}>
              {etat.databaseId ?? '—'}
            </dd>
          </div>
        </dl>

        {etat.derniersRuns.length > 0 ? (
          <div className="border-t border-hair pt-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Journal des synchronisations
            </p>
            <ul className="space-y-1.5 text-xs">
              {etat.derniersRuns.map((run, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span aria-hidden className={run.succes ? 'text-[var(--good-texte)]' : 'text-[var(--critical)]'}>
                    {run.succes ? '✓' : '✕'}
                  </span>
                  <span className="text-ink-muted tabulaire">{formaterDateHeure(run.lanceLe)}</span>
                  <span className="text-ink-2">
                    {run.direction} · {run.crees} créé(s), {run.maj} mis à jour, {run.ignores} inchangé(s)
                  </span>
                  {run.erreurs.length > 0 ? (
                    <span className="text-[var(--critical)]" title={run.erreurs.join('\n')}>
                      {run.erreurs.length} erreur(s)
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Carte>
  );
}
