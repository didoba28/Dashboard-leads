'use client';

/** Import de leads : coller un CSV ou déposer un fichier. */
import { useState } from 'react';
import { Bouton, Carte, ZoneTexte } from '@/components/ui/primitives';
import { useToasts } from '@/components/ui/toast';

interface Resultat {
  total: number;
  crees: number;
  doublons: number;
  rejetes: number;
  erreurs: Array<{ ligne: number; message: string }>;
}

const MODELE = [
  'Date;Nom;E-mail;Société;Ville;Segment;Relation;Type de demande;Initiative;Source;Campagne;Lead magnet;Statut',
  '05/10/2026;Marie Dupont;m.dupont@mairie-lyon.fr;Mairie de Lyon;Lyon;Collectivité;Prospect;Fiche technique;Inbound / site web;Site web;;Fiche technique Arena;Nouveau',
  '06/10/2026;Paul Martin;paul.martin@gmail.com;;Nantes;B2C;Prospect;Formulaire de contact;Inbound / site web;E-mail / formulaire;;;Nouveau',
].join('\n');

export function ImportCsv({ onTermine }: { onTermine: () => void }) {
  const [contenu, setContenu] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const { notifier } = useToasts();

  async function lireFichier(fichier: File) {
    setContenu(await fichier.text());
    setResultat(null);
  }

  async function importer() {
    if (contenu.trim() === '') return;
    setEnCours(true);
    try {
      const reponse = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: contenu }),
      });
      const data = await reponse.json();
      if (!reponse.ok) throw new Error(data?.erreur ?? 'Import impossible');
      setResultat(data as Resultat);
      notifier({
        ton: data.rejetes > 0 ? 'info' : 'succes',
        titre: `${data.crees} lead(s) importé(s)`,
        detail:
          data.rejetes > 0
            ? `${data.rejetes} ligne(s) rejetée(s), ${data.doublons} doublon(s) ignoré(s).`
            : `${data.doublons} doublon(s) ignoré(s).`,
      });
    } catch (err) {
      notifier({ ton: 'erreur', titre: 'Import impossible', detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <p className="text-xs text-ink-2">
          Collez un export CSV (séparateur <code className="rounded bg-surface-2 px-1">;</code> ou{' '}
          <code className="rounded bg-surface-2 px-1">,</code>) ou déposez un fichier. Les en-têtes sont
          reconnus en clair et les valeurs acceptent aussi bien les libellés («&nbsp;Collectivité&nbsp;»)
          que les clés techniques («&nbsp;collectivite&nbsp;»). Les doublons du même jour sont ignorés.
        </p>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-hair-fort px-4 py-6 text-xs text-ink-2 transition-colors hover:bg-surface-2">
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void lireFichier(f);
            }}
          />
          Choisir un fichier CSV
        </label>

        <ZoneTexte
          value={contenu}
          onChange={(e) => {
            setContenu(e.target.value);
            setResultat(null);
          }}
          rows={10}
          placeholder={MODELE}
          className="font-mono text-[11px] leading-relaxed"
          aria-label="Contenu CSV"
        />

        <button
          type="button"
          onClick={() => setContenu(MODELE)}
          className="text-xs text-[var(--s1)] underline-offset-2 hover:underline"
        >
          Insérer un modèle d’exemple
        </button>

        {resultat ? (
          <Carte className="px-4 py-3">
            <p className="text-[13px] font-medium text-ink">Résultat de l’import</p>
            <dl className="mt-2 grid grid-cols-4 gap-2 text-xs">
              {[
                ['Lignes', resultat.total],
                ['Créés', resultat.crees],
                ['Doublons', resultat.doublons],
                ['Rejetés', resultat.rejetes],
              ].map(([label, valeur]) => (
                <div key={String(label)}>
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="mt-0.5 font-medium text-ink tabulaire">{valeur}</dd>
                </div>
              ))}
            </dl>
            {resultat.erreurs.length > 0 ? (
              <ul className="mt-3 max-h-40 space-y-1 overflow-auto border-t border-hair pt-2 text-[11px] text-ink-2">
                {resultat.erreurs.map((e, i) => (
                  <li key={i}>
                    <span className="text-ink-muted">Ligne {e.ligne} :</span> {e.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </Carte>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-hair px-5 py-3">
        <Bouton variante="discret" onClick={onTermine}>
          Fermer
        </Bouton>
        <Bouton variante="principal" onClick={importer} enCours={enCours} disabled={contenu.trim() === ''}>
          Importer
        </Bouton>
      </div>
    </div>
  );
}
