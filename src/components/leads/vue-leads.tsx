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
  type SourceCollecte,
} from '@/lib/domain/taxonomy';
import { pointsDuLead, pointsProposesDuLead, type Lead } from '@/lib/domain/lead';
import { Badge, Bouton, Carte, EtatVide, Entree, Interrupteur, Selection, Spinner } from '@/components/ui/primitives';
import { Panneau } from '@/components/ui/panneau';
import { FormulaireLead } from './formulaire-lead';
import { ImportCsv } from './import-csv';
import { formaterDateCourte, formaterPoints } from '@/lib/format';
import { useToasts } from '@/components/ui/toast';
import { confirmerSelectionLeads, supprimerSelectionLeads } from '@/app/leads/actions';
import { RapportAutomatisation } from './rapport-automatisation';

export interface FiltresVue {
  periode: string;
  dateDebut: string;
  dateFin: string;
  q: string;
  segment: string;
  statut: string;
  typeDemande: string;
  initiative: string;
  aVerifier: boolean;
  aConfirmer: boolean;
  valides: boolean;
  tri: string;
}

const TAILLE_PAGE = 50;
const DATE_DEBUT_OCTOBRE = '2026-10-01';

function construireQuery(f: FiltresVue, offset: number): string {
  const p = new URLSearchParams();
  if (f.periode !== 'toutes') p.set('periode', f.periode);
  if (f.dateDebut) p.set('dateDebut', f.dateDebut);
  if (f.dateFin) p.set('dateFin', f.dateFin);
  p.set('limite', String(TAILLE_PAGE));
  p.set('offset', String(offset));
  p.set('tri', f.tri);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.segment) p.set('segment', f.segment);
  if (f.statut) p.set('statut', f.statut);
  if (f.typeDemande) p.set('typeDemande', f.typeDemande);
  if (f.initiative) p.set('initiative', f.initiative);
  if (f.aVerifier) p.set('aVerifier', 'true');
  if (f.valides) p.set('pointsConfirmes', 'true');
  else if (f.aConfirmer) p.set('pointsConfirmes', 'false');
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

function LogoSlack() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" role="img" aria-label="Slack">
      <rect x="9.25" y="1" width="4.25" height="9" rx="2.125" fill="#36C5F0" />
      <rect x="14" y="5.75" width="9" height="4.25" rx="2.125" fill="#2EB67D" />
      <rect x="10.5" y="14" width="4.25" height="9" rx="2.125" fill="#ECB22E" />
      <rect x="1" y="14" width="9" height="4.25" rx="2.125" fill="#E01E5A" />
      <circle cx="7.25" cy="7.9" r="2.1" fill="#36C5F0" />
      <circle cx="16.1" cy="12.1" r="2.1" fill="#2EB67D" />
      <circle cx="7.9" cy="11.9" r="2.1" fill="#E01E5A" />
      <circle cx="12.65" cy="16.1" r="2.1" fill="#ECB22E" />
    </svg>
  );
}

function LogoGmail() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" role="img" aria-label="Gmail">
      <path d="M3 7.2v10.3" fill="none" stroke="#4285F4" strokeWidth="3" strokeLinecap="round" />
      <path d="M21 7.2v10.3" fill="none" stroke="#34A853" strokeWidth="3" strokeLinecap="round" />
      <path d="M3.2 7.1 12 14l8.8-6.9" fill="none" stroke="#EA4335" strokeWidth="3" strokeLinejoin="round" />
      <path d="M3 17.5h4" fill="none" stroke="#FBBC04" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CanalCollecte({ source }: { source: SourceCollecte }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {source === 'slack_inbound' ? <LogoSlack /> : null}
      {source === 'email_formulaire' ? <LogoGmail /> : null}
      <span className="truncate">{LABELS_SOURCE_COLLECTE[source]}</span>
    </span>
  );
}

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
  const [idsSelectionnes, setIdsSelectionnes] = useState<Set<string>>(() => new Set());
  const [actionGroupee, setActionGroupee] = useState<'confirmation' | 'suppression' | null>(null);
  const premierRendu = useRef(true);
  const caseToutRef = useRef<HTMLInputElement>(null);
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
        setIdsSelectionnes(new Set());
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

  function majPeriode(valeur: string) {
    setOffset(0);
    setFiltres((f) => ({ ...f, periode: valeur, dateDebut: '', dateFin: '' }));
  }

  function majDate(cle: 'dateDebut' | 'dateFin', valeur: string) {
    setOffset(0);
    setFiltres((f) => ({ ...f, periode: 'toutes', [cle]: valeur }));
  }

  function basculerDepuisOctobre(actif: boolean) {
    setOffset(0);
    setFiltres((f) => ({
      ...f,
      periode: 'toutes',
      dateDebut: actif ? DATE_DEBUT_OCTOBRE : '',
      dateFin: '',
    }));
  }

  function basculerAConfirmer(actif: boolean) {
    setOffset(0);
    setFiltres((f) => ({ ...f, aConfirmer: actif, valides: actif ? false : f.valides }));
  }

  function basculerValides(actif: boolean) {
    setOffset(0);
    setFiltres((f) => ({ ...f, valides: actif, aConfirmer: actif ? false : f.aConfirmer }));
  }

  const nbFiltresActifs = useMemo(
    () =>
      [filtres.q, filtres.segment, filtres.statut, filtres.typeDemande, filtres.initiative].filter(Boolean).length +
      (filtres.dateDebut || filtres.dateFin ? 1 : 0) +
      (filtres.aVerifier ? 1 : 0) + (filtres.aConfirmer ? 1 : 0) + (filtres.valides ? 1 : 0),
    [filtres],
  );

  function reinitialiser() {
    setRecherche('');
    setOffset(0);
    setFiltres((f) => ({
      ...f,
      q: '',
      dateDebut: '',
      dateFin: '',
      segment: '',
      statut: '',
      typeDemande: '',
      initiative: '',
      aVerifier: false,
      aConfirmer: false,
      valides: false,
    }));
  }

  const leadsSelectionnes = useMemo(
    () => leads.filter((lead) => idsSelectionnes.has(lead.id)),
    [idsSelectionnes, leads],
  );
  const idsAConfirmer = useMemo(
    () => leadsSelectionnes.filter((lead) => lead.validationRequise && !lead.pointsConfirmes).map((lead) => lead.id),
    [leadsSelectionnes],
  );
  const tousSelectionnes = leads.length > 0 && idsSelectionnes.size === leads.length;
  const selectionPartielle = idsSelectionnes.size > 0 && !tousSelectionnes;

  useEffect(() => {
    if (caseToutRef.current) caseToutRef.current.indeterminate = selectionPartielle;
  }, [selectionPartielle]);

  function basculerLead(id: string) {
    setIdsSelectionnes((actuels) => {
      const suivants = new Set(actuels);
      if (suivants.has(id)) suivants.delete(id);
      else suivants.add(id);
      return suivants;
    });
  }

  function basculerTout() {
    setIdsSelectionnes(tousSelectionnes ? new Set() : new Set(leads.map((lead) => lead.id)));
  }

  async function confirmerEnLot() {
    if (idsAConfirmer.length === 0) return;
    if (!window.confirm(`Confirmer les points de ${idsAConfirmer.length} lead${idsAConfirmer.length > 1 ? 's' : ''} ?`)) return;
    setActionGroupee('confirmation');
    try {
      const { modifies } = await confirmerSelectionLeads(idsAConfirmer);
      notifier({
        ton: 'succes',
        titre: `${modifies} lead${modifies > 1 ? 's' : ''} confirmé${modifies > 1 ? 's' : ''}`,
      });
      await recharger(filtres, offset);
    } catch (err) {
      notifier({
        ton: 'erreur',
        titre: 'Confirmation impossible',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setActionGroupee(null);
    }
  }

  async function supprimerEnLot() {
    const ids = leadsSelectionnes.map((lead) => lead.id);
    if (ids.length === 0) return;
    if (!window.confirm(`Supprimer ${ids.length} lead${ids.length > 1 ? 's' : ''} sélectionné${ids.length > 1 ? 's' : ''} ?`)) return;
    setActionGroupee('suppression');
    try {
      const { modifies } = await supprimerSelectionLeads(ids);
      notifier({
        ton: 'succes',
        titre: `${modifies} lead${modifies > 1 ? 's' : ''} supprimé${modifies > 1 ? 's' : ''}`,
      });
      await recharger(filtres, offset);
    } catch (err) {
      notifier({
        ton: 'erreur',
        titre: 'Suppression impossible',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setActionGroupee(null);
    }
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

      <RapportAutomatisation />

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
            largeur="w-36"
            label="Période"
            valeur={filtres.periode}
            onChange={majPeriode}
            options={[...periodes]
              .sort((a, b) => {
                if (a.id === 'toutes') return -1;
                if (b.id === 'toutes') return 1;
                return b.id.localeCompare(a.id);
              })
              .map((p) => ({ valeur: p.id, label: p.label }))}
          />
          <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span>Du</span>
            <Entree
              type="date"
              value={filtres.dateDebut}
              max={filtres.dateFin || undefined}
              onChange={(e) => majDate('dateDebut', e.target.value)}
              className="h-8 w-[8.25rem] px-2 text-xs"
              aria-label="Date de début"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span>Au</span>
            <Entree
              type="date"
              value={filtres.dateFin}
              min={filtres.dateDebut || undefined}
              onChange={(e) => majDate('dateFin', e.target.value)}
              className="h-8 w-[8.25rem] px-2 text-xs"
              aria-label="Date de fin"
            />
          </label>
          <div className="flex items-center gap-1.5">
            <Interrupteur
              actif={filtres.dateDebut === DATE_DEBUT_OCTOBRE && !filtres.dateFin}
              onChange={basculerDepuisOctobre}
              label="Afficher uniquement les leads reçus depuis le 1er octobre 2026"
            />
            <span className="whitespace-nowrap text-xs text-ink-2">Depuis le 1er oct. 2026</span>
          </div>
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
              onChange={basculerAConfirmer}
              label="Afficher seulement les leads dont les points restent à confirmer"
            />
            <span className="text-xs text-ink-2">Points à confirmer</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Interrupteur
              actif={filtres.valides}
              onChange={basculerValides}
              label="Afficher seulement les leads dont les points sont déjà validés"
            />
            <span className="text-xs text-ink-2">Déjà validés</span>
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
        {idsSelectionnes.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-hair bg-surface-2 px-4 py-2.5">
            <p className="mr-auto text-xs font-medium text-ink">
              {idsSelectionnes.size} lead{idsSelectionnes.size > 1 ? 's' : ''} sélectionné{idsSelectionnes.size > 1 ? 's' : ''}
            </p>
            <Bouton
              taille="petit"
              variante="secondaire"
              disabled={idsAConfirmer.length === 0 || actionGroupee !== null}
              enCours={actionGroupee === 'confirmation'}
              onClick={() => void confirmerEnLot()}
            >
              Confirmer les points{idsAConfirmer.length > 0 ? ` (${idsAConfirmer.length})` : ''}
            </Bouton>
            <Bouton
              taille="petit"
              variante="danger"
              disabled={actionGroupee !== null}
              enCours={actionGroupee === 'suppression'}
              onClick={() => void supprimerEnLot()}
            >
              Supprimer
            </Bouton>
            <Bouton
              taille="petit"
              variante="discret"
              disabled={actionGroupee !== null}
              onClick={() => setIdsSelectionnes(new Set())}
            >
              Désélectionner
            </Bouton>
          </div>
        ) : null}
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
            <table className="w-full min-w-[970px] table-fixed text-left text-[13px]">
              <thead>
                <tr className="border-b border-hair text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="w-11 py-2 pl-4 pr-2 font-medium">
                    <input
                      ref={caseToutRef}
                      type="checkbox"
                      checked={tousSelectionnes}
                      onChange={basculerTout}
                      aria-label={tousSelectionnes ? 'Désélectionner les leads affichés' : 'Sélectionner les leads affichés'}
                      className="h-3.5 w-3.5 cursor-pointer accent-[var(--s1)]"
                    />
                  </th>
                  <th className="w-20 py-2 pr-3 font-medium">Date</th>
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
                  const valideAffiche = filtres.valides && lead.pointsConfirmes;
                  return (
                    <tr
                      key={lead.id}
                      tabIndex={0}
                      aria-selected={idsSelectionnes.has(lead.id)}
                      onClick={() => setSelection(lead)}
                      onKeyDown={(e) => {
                        if (e.currentTarget !== e.target) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelection(lead);
                        }
                      }}
                      className={clsx(
                        'cursor-pointer border-b border-hair/60 transition-colors last:border-0 hover:bg-surface-2 focus-visible:bg-surface-2',
                        idsSelectionnes.has(lead.id) && 'bg-[color-mix(in_srgb,var(--s1)_7%,transparent)]',
                      )}
                    >
                      <td className="py-2.5 pl-4 pr-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={idsSelectionnes.has(lead.id)}
                          onChange={() => basculerLead(lead.id)}
                          aria-label={`Sélectionner ${lead.nom ?? lead.societe ?? lead.email ?? 'ce lead'}`}
                          className="h-3.5 w-3.5 cursor-pointer accent-[var(--s1)]"
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-ink-muted tabulaire">
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
                          {valideAffiche ? <Badge ton="bon">validé</Badge> : null}
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
                          <span className="block truncate text-[11px] text-ink-muted">
                            Origine : {lead.leadMagnet}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-48 py-2.5 pr-3 text-xs text-ink-2">
                        <span className="block truncate">{LABELS_INITIATIVE[lead.initiative]}</span>
                        <span className="block truncate text-[11px] text-ink-muted">
                          <CanalCollecte source={lead.sourceCollecte} />
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
              <CanalCollecte source={selection.sourceCollecte} />
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
