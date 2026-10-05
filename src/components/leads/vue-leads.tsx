'use client';

/** Liste des leads : une barre de filtres unique, un tableau, un panneau latéral. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  LABELS_INITIATIVE,
  LABELS_SEGMENT,
  LABELS_SOURCE_COLLECTE,
  LABELS_STATUT,
  LABELS_TYPE_DEMANDE,
  INITIATIVES,
  SEGMENTS,
  STATUTS,
  TYPES_DEMANDE,
} from '@/lib/domain/taxonomy';
import { pointsDuLead, pointsProposesDuLead, type Lead } from '@/lib/domain/lead';
import { Badge, Bouton, Carte, EtatVide, Entree, Interrupteur, Selection, Spinner } from '@/components/ui/primitives';
import { Panneau } from '@/components/ui/panneau';
import { FormulaireLead } from './formulaire-lead';
import { ImportCsv } from './import-csv';
import { formaterDateCourte, formaterPoints } from '@/lib/format';
import { useToasts } from '@/components/ui/toast';

export interface FiltresVue {
  periode: string;
  q: string;
  segment: string;
  statut: string;
  typeDemande: string;
  initiative: string;
  aVerifier: boolean;
  aConfirmer: boolean;
  tri: string;
}

const TAILLE_PAGE = 50;

function construireQuery(f: FiltresVue, offset: number): string {
  const p = new URLSearchParams();
  if (f.periode !== 'toutes') p.set('periode', f.periode);
  p.set('limite', String(TAILLE_PAGE));
  p.set('offset', String(offset));
  p.set('tri', f.tri);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.segment) p.set('segment', f.segment);
  if (f.statut) p.set('statut', f.statut);
  if (f.typeDemande) p.set('typeDemande', f.typeDemande);
  if (f.initiative) p.set('initiative', f.initiative);
  if (f.aVerifier) p.set('aVerifier', 'true');
  if (f.aConfirmer) p.set('pointsConfirmes', 'false');
  return p.toString();
}

const TON_STATUT: Record<string, 'neutre' | 'info' | 'bon' | 'attention' | 'critique'> = {
  nouveau: 'neutre',
  a_qualifier: 'attention',
  qualifie: 'info',
  active: 'bon',
  reactive: 'bon',
  non_qualifie: 'neutre',
  perdu: 'critique',
};

/** Un filtre de la barre : largeur maîtrisée, libellé accessible. */
function FiltreSelect({
  largeur,
  label,
  valeur,
  onChange,
  options,
  vide,
}: {
  largeur: string;
  label: string;
  valeur: string;
  onChange: (v: string) => void;
  options: Array<{ valeur: string; label: string }>;
  vide?: string;
}) {
  return (
    <div className={largeur}>
      <Selection
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
        aria-label={label}
      >
        {vide ? <option value="">{vide}</option> : null}
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.label}
          </option>
        ))}
      </Selection>
    </div>
  );
}

export function VueLeads({
  leadsInitiaux,
  totalInitial,
  filtresInitiaux,
  periodes,
}: {
  leadsInitiaux: Lead[];
  totalInitial: number;
  filtresInitiaux: FiltresVue;
  periodes: Array<{ id: string; label: string }>;
}) {
  const [filtres, setFiltres] = useState<FiltresVue>(filtresInitiaux);
  const [recherche, setRecherche] = useState(filtresInitiaux.q);
  const [leads, setLeads] = useState<Lead[]>(leadsInitiaux);
  const [total, setTotal] = useState(totalInitial);
  const [offset, setOffset] = useState(0);
  const [chargement, setChargement] = useState(false);
  const [selection, setSelection] = useState<Lead | null>(null);
  const [creation, setCreation] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const premierRendu = useRef(true);
  const { notifier } = useToasts();

  // Recherche différée : on ne requête pas à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => setFiltres((f) => (f.q === recherche ? f : { ...f, q: recherche })), 280);
    return () => clearTimeout(t);
  }, [recherche]);

  const recharger = useCallback(
    async (f: FiltresVue, o: number) => {
      setChargement(true);
      try {
        const reponse = await fetch(`/api/leads?${construireQuery(f, o)}`);
        const data = await reponse.json();
        if (!reponse.ok) throw new Error(data?.erreur ?? 'Chargement impossible');
        setLeads(data.leads as Lead[]);
        setTotal(data.total as number);
      } catch (err) {
        notifier({ ton: 'erreur', titre: 'Chargement impossible', detail: err instanceof Error ? err.message : String(err) });
      } finally {
        setChargement(false);
      }
    },
    [notifier],
  );

  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    void recharger(filtres, offset);
  }, [filtres, offset, recharger]);

  function majFiltre<K extends keyof FiltresVue>(cle: K, valeur: FiltresVue[K]) {
    setOffset(0);
    setFiltres((f) => ({ ...f, [cle]: valeur }));
  }

  const nbFiltresActifs = useMemo(
    () =>
      [filtres.q, filtres.segment, filtres.statut, filtres.typeDemande, filtres.initiative].filter(Boolean).length +
      (filtres.aVerifier ? 1 : 0) + (filtres.aConfirmer ? 1 : 0),
    [filtres],
  );

  function reinitialiser() {
    setRecherche('');
    setOffset(0);
    setFiltres((f) => ({ ...f, q: '', segment: '', statut: '', typeDemande: '', initiative: '', aVerifier: false, aConfirmer: false }));
  }

  async function supprimer(lead: Lead) {
    if (!window.confirm(`Supprimer définitivement le lead « ${lead.nom ?? lead.email ?? lead.id} » ?`)) return;
    const reponse = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
    if (reponse.ok) {
      notifier({ ton: 'succes', titre: 'Lead supprimé' });
      setSelection(null);
      void recharger(filtres, offset);
    } else {
      notifier({ ton: 'erreur', titre: 'Suppression impossible' });
    }
  }

  const lienExport = `/api/export?${construireQuery(filtres, 0)}`;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Leads</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {total} lead{total > 1 ? 's' : ''} sur la sélection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={lienExport}
            className="inline-flex h-9 items-center rounded-lg border border-hair-fort px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2"
          >
            Exporter CSV
          </a>
          <Bouton onClick={() => setImportOuvert(true)}>Importer</Bouton>
          <Bouton variante="principal" onClick={() => setCreation(true)}>
            Nouveau lead
          </Bouton>
        </div>
      </header>

      {/* Une seule rangée de filtres, qui cadre tout ce qui est en dessous. */}
      <Carte className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full max-w-72">
            <Entree
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un nom, une société, un e-mail…"
              className="h-8 text-xs"
              type="search"
              aria-label="Rechercher"
            />
          </div>
          <FiltreSelect
            largeur="w-28"
            label="Période"
            valeur={filtres.periode}
            onChange={(v) => majFiltre('periode', v)}
            options={periodes.map((p) => ({ valeur: p.id, label: p.label }))}
          />
          <FiltreSelect
            largeur="w-36"
            label="Segment"
            valeur={filtres.segment}
            onChange={(v) => majFiltre('segment', v)}
            vide="Tous segments"
            options={SEGMENTS.map((s) => ({ valeur: s, label: LABELS_SEGMENT[s] }))}
          />
          <FiltreSelect
            largeur="w-32"
            label="Statut"
            valeur={filtres.statut}
            onChange={(v) => majFiltre('statut', v)}
            vide="Tous statuts"
            options={STATUTS.map((s) => ({ valeur: s, label: LABELS_STATUT[s] }))}
          />
          <FiltreSelect
            largeur="w-44"
            label="Type de demande"
            valeur={filtres.typeDemande}
            onChange={(v) => majFiltre('typeDemande', v)}
            vide="Tous types"
            options={TYPES_DEMANDE.map((t) => ({ valeur: t, label: LABELS_TYPE_DEMANDE[t] }))}
          />
          <FiltreSelect
            largeur="w-48"
            label="Initiative"
            valeur={filtres.initiative}
            onChange={(v) => majFiltre('initiative', v)}
            vide="Toutes initiatives"
            options={INITIATIVES.map((i) => ({ valeur: i, label: LABELS_INITIATIVE[i] }))}
          />
          <div className="flex items-center gap-1.5">
            <Interrupteur
              actif={filtres.aConfirmer}
              onChange={(v) => majFiltre('aConfirmer', v)}
              label="Afficher seulement les leads dont les points restent à confirmer"
            />
            <span className="text-xs text-ink-2">Points à confirmer</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Interrupteur
              actif={filtres.aVerifier}
              onChange={(v) => majFiltre('aVerifier', v)}
              label="Afficher seulement les leads à vérifier"
            />
            <span className="text-xs text-ink-2">À vérifier</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {nbFiltresActifs > 0 ? (
              <Bouton variante="discret" taille="petit" onClick={reinitialiser}>
                Réinitialiser ({nbFiltresActifs})
              </Bouton>
            ) : null}
            <FiltreSelect
              largeur="w-40"
              label="Tri"
              valeur={filtres.tri}
              onChange={(v) => majFiltre('tri', v)}
              options={[
                { valeur: 'date_desc', label: 'Plus récents' },
                { valeur: 'date_asc', label: 'Plus anciens' },
                { valeur: 'points_desc', label: 'Points décroissants' },
                { valeur: 'maj_desc', label: 'Modifiés récemment' },
              ]}
            />
          </div>
        </div>
      </Carte>

      <Carte className="overflow-hidden">
        <div className={clsx('overflow-x-auto transition-opacity', chargement && 'opacity-60')}>
          {leads.length === 0 ? (
            <EtatVide
              titre="Aucun lead ne correspond"
              description="Élargissez la période ou réinitialisez les filtres."
              action={
                nbFiltresActifs > 0 ? (
                  <Bouton onClick={reinitialiser}>Réinitialiser les filtres</Bouton>
                ) : (
                  <Bouton variante="principal" onClick={() => setCreation(true)}>
                    Ajouter un lead
                  </Bouton>
                )
              }
            />
          ) : (
            <table className="w-full min-w-[920px] table-fixed text-left text-[13px]">
              <thead>
                <tr className="border-b border-hair text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="w-20 py-2 pl-4 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Lead</th>
                  <th className="w-28 py-2 pr-3 font-medium">Segment</th>
                  <th className="w-56 py-2 pr-3 font-medium">Demande</th>
                  <th className="w-52 py-2 pr-3 font-medium">Initiative</th>
                  <th className="w-28 py-2 pr-3 font-medium">Statut</th>
                  <th className="w-20 py-2 pr-4 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const points = pointsDuLead(lead);
                  const pointsProposes = pointsProposesDuLead(lead);
                  const enAttente = lead.validationRequise && !lead.pointsConfirmes;
                  return (
                    <tr
                      key={lead.id}
                      tabIndex={0}
                      onClick={() => setSelection(lead)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelection(lead);
                        }
                      }}
                      className="cursor-pointer border-b border-hair/60 transition-colors last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2"
                    >
                      <td className="py-2.5 pl-4 pr-3 text-xs text-ink-muted tabulaire">
                        {formaterDateCourte(lead.dateReception)}
                      </td>
                      <td className="max-w-64 py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">
                              {lead.nom ?? lead.societe ?? lead.email ?? 'Sans nom'}
                            </p>
                            <p className="truncate text-xs text-ink-muted">
                              {lead.societe && lead.nom ? lead.societe : (lead.email ?? '—')}
                            </p>
                          </div>
                          {enAttente ? <Badge ton="attention">à confirmer</Badge> : null}
                          {lead.aVerifier ? (
                            <Badge ton="attention" icone={<span aria-hidden>!</span>}>
                              à vérifier
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-ink-2">{LABELS_SEGMENT[lead.segment]}</td>
                      <td className="max-w-52 py-2.5 pr-3 text-xs text-ink-2">
                        <span className="block truncate">{LABELS_TYPE_DEMANDE[lead.typeDemande]}</span>
                        {lead.leadMagnet ? (
                          <span className="block truncate text-[11px] text-ink-muted">{lead.leadMagnet}</span>
                        ) : null}
                      </td>
                      <td className="max-w-48 py-2.5 pr-3 text-xs text-ink-2">
                        <span className="block truncate">{LABELS_INITIATIVE[lead.initiative]}</span>
                        <span className="block truncate text-[11px] text-ink-muted">
                          {LABELS_SOURCE_COLLECTE[lead.sourceCollecte]}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge ton={TON_STATUT[lead.statut] ?? 'neutre'}>{LABELS_STATUT[lead.statut]}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <span
                          className={clsx(
                            'font-medium tabulaire',
                            points === 0 ? 'text-ink-muted' : 'text-ink',
                          )}
                          title={lead.regleLabel}
                        >
                          {formaterPoints(points)}
                        </span>
                        {enAttente ? (
                          <span className="block text-[11px] text-[var(--warning)]" title="Proposition non comptabilisée">
                            {formaterPoints(pointsProposes)} proposé
                          </span>
                        ) : null}
                        {lead.pointsOverride != null ? (
                          <span className="ml-1 text-[11px] text-[var(--warning)]" title="Arbitrage manuel" aria-label="Arbitrage manuel">
                            ✎
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {total > TAILLE_PAGE ? (
          <div className="flex items-center justify-between border-t border-hair px-4 py-2.5 text-xs text-ink-muted">
            <span className="tabulaire">
              {offset + 1}–{Math.min(offset + TAILLE_PAGE, total)} sur {total}
            </span>
            <div className="flex items-center gap-2">
              {chargement ? <Spinner /> : null}
              <Bouton
                taille="petit"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - TAILLE_PAGE))}
              >
                Précédent
              </Bouton>
              <Bouton
                taille="petit"
                disabled={offset + TAILLE_PAGE >= total}
                onClick={() => setOffset(offset + TAILLE_PAGE)}
              >
                Suivant
              </Bouton>
            </div>
          </div>
        ) : null}
      </Carte>

      <Panneau
        ouvert={selection !== null}
        titre={selection?.nom ?? selection?.societe ?? selection?.email ?? 'Lead'}
        sousTitre={
          selection ? (
            <span className="flex items-center gap-2">
              Reçu le {formaterDateCourte(selection.dateReception)} ·{' '}
              {LABELS_SOURCE_COLLECTE[selection.sourceCollecte]}
              <button
                type="button"
                onClick={() => void supprimer(selection)}
                className="text-[var(--critical)] underline-offset-2 hover:underline"
              >
                Supprimer
              </button>
            </span>
          ) : undefined
        }
        onFermer={() => setSelection(null)}
      >
        {selection ? (
          <FormulaireLead
            lead={selection}
            onAnnuler={() => setSelection(null)}
            onEnregistre={() => {
              setSelection(null);
              void recharger(filtres, offset);
            }}
          />
        ) : null}
      </Panneau>

      <Panneau ouvert={creation} titre="Nouveau lead" onFermer={() => setCreation(false)}>
        <FormulaireLead
          lead={null}
          onAnnuler={() => setCreation(false)}
          onEnregistre={() => {
            setCreation(false);
            void recharger(filtres, offset);
          }}
        />
      </Panneau>

      <Panneau ouvert={importOuvert} titre="Importer des leads" onFermer={() => setImportOuvert(false)}>
        <ImportCsv
          onTermine={() => {
            setImportOuvert(false);
            void recharger(filtres, offset);
          }}
        />
      </Panneau>
    </div>
  );
}
