'use client';

/** Liste des leads : une barre de filtres unique, un tableau, un panneau latéral. */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import dynamic from 'next/dynamic';
import {
  LABELS_INITIATIVE,
  LABELS_RELATION,
  LABELS_SEGMENT,
  LABELS_SOURCE_COLLECTE,
  LABELS_STATUT,
  LABELS_TYPE_DEMANDE,
  INITIATIVES,
  RELATIONS,
  SEGMENTS,
  SOURCES_COLLECTE,
  STATUTS,
  TYPES_DEMANDE,
  type SourceCollecte,
} from '@/lib/domain/taxonomy';
import { pointsDuLead, pointsProposesDuLead, type Lead } from '@/lib/domain/lead';
import { Badge, Bouton, Carte, EtatVide, Entree, Interrupteur, Selection, Spinner } from '@/components/ui/primitives';
import { Panneau } from '@/components/ui/panneau';
import { formaterDateCourte, formaterMoisAnnee, formaterPoints } from '@/lib/format';
import { useToasts } from '@/components/ui/toast';
import { confirmerSelectionLeads, supprimerSelectionLeads } from '@/app/leads/actions';
import { RapportAutomatisation } from './rapport-automatisation';
import { construireQueryLeads, filtresVides, TAILLE_PAGE_LEADS, type FiltresVue } from '@/lib/leads-filters';

export type { FiltresVue } from '@/lib/leads-filters';

const TAILLE_PAGE = TAILLE_PAGE_LEADS;
const DATE_DEBUT_OCTOBRE = '2026-10-01';
const FormulaireLead = dynamic(() => import('./formulaire-lead').then((module) => module.FormulaireLead), {
  loading: () => <p className="flex items-center gap-2 px-5 py-6 text-xs text-ink-muted"><Spinner /> Chargement de la fiche…</p>,
});
const ImportCsv = dynamic(() => import('./import-csv').then((module) => module.ImportCsv), {
  loading: () => <p className="flex items-center gap-2 px-5 py-6 text-xs text-ink-muted"><Spinner /> Chargement de l’import…</p>,
});

const VUES_RAPIDES = [
  { id: 'tous', label: 'Tous' }, { id: 'a_confirmer', label: 'À confirmer' },
  { id: 'valides', label: 'Validés' }, { id: 'a_verifier', label: 'À vérifier' },
  { id: 'exclus', label: 'Exclus' },
] as const;

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
        {valeur.includes(',') ? <option value={valeur}>{valeur.split(',').map((v) => options.find((o) => o.valeur === v)?.label ?? v).join(', ')}</option> : null}
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
  offsetInitial = 0,
  leadInitial = null,
  leadIntrouvable = false,
  periodes,
}: {
  leadsInitiaux: Lead[];
  totalInitial: number;
  filtresInitiaux: FiltresVue;
  offsetInitial?: number;
  leadInitial?: Lead | null;
  leadIntrouvable?: boolean;
  periodes: Array<{ id: string; label: string }>;
}) {
  const [filtres, setFiltres] = useState<FiltresVue>(filtresInitiaux);
  const [recherche, setRecherche] = useState(filtresInitiaux.q);
  const [rechercheProprietaire, setRechercheProprietaire] = useState(filtresInitiaux.proprietaire);
  const [leads, setLeads] = useState<Lead[]>(leadsInitiaux);
  const [total, setTotal] = useState(totalInitial);
  const [offset, setOffset] = useState(offsetInitial);
  const [chargement, setChargement] = useState(false);
  const [selection, setSelection] = useState<Lead | null>(leadInitial);
  const [formulaireModifie, setFormulaireModifie] = useState(false);
  const [actionAbandon, setActionAbandon] = useState<(() => void) | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [derniereLecture, setDerniereLecture] = useState<string | null>(null);
  const [moisReplies, setMoisReplies] = useState<Set<string>>(() => new Set());
  const [filtresAvances, setFiltresAvances] = useState(false);
  const [creation, setCreation] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const [idsSelectionnes, setIdsSelectionnes] = useState<Set<string>>(() => new Set());
  const [actionGroupee, setActionGroupee] = useState<'confirmation' | 'suppression' | null>(null);
  const premierRendu = useRef(true);
  const requete = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const etatRequete = useRef({ filtres, offset });
  etatRequete.current = { filtres, offset };
  const caseToutRef = useRef<HTMLInputElement>(null);
  const { notifier } = useToasts();

  // Recherche différée : on ne requête pas à chaque frappe.
  useEffect(() => {
    if (recherche === filtres.q) return;
    const t = setTimeout(() => {
      setOffset(0);
      setFiltres((f) => ({ ...f, q: recherche }));
    }, 280);
    return () => clearTimeout(t);
  }, [recherche, filtres.q]);

  useEffect(() => {
    if (rechercheProprietaire === filtres.proprietaire) return;
    const t = setTimeout(() => { setOffset(0); setFiltres((f) => ({ ...f, proprietaire: rechercheProprietaire })); }, 280);
    return () => clearTimeout(t);
  }, [rechercheProprietaire, filtres.proprietaire]);

  const recharger = useCallback(
    async (f: FiltresVue, o: number) => {
      requete.current?.abort();
      const controleur = new AbortController();
      requete.current = controleur;
      const numero = ++generation.current;
      setChargement(true);
      setErreurChargement(null);
      try {
        const reponse = await fetch(`/api/leads?${construireQueryLeads(f, o)}`, { signal: controleur.signal, cache: 'no-store' });
        const data = await reponse.json();
        if (!reponse.ok) throw new Error(data?.erreur ?? 'Chargement impossible');
        if (numero !== generation.current || controleur.signal.aborted) return;
        if (!Array.isArray(data.leads) || !Number.isFinite(data.total)) throw new Error('Réponse de chargement invalide.');
        if (o > 0 && (data.total === 0 || o >= data.total)) {
          setOffset(data.total > 0 ? Math.floor((data.total - 1) / TAILLE_PAGE) * TAILLE_PAGE : 0);
          return;
        }
        setLeads(data.leads as Lead[]);
        setTotal(data.total as number);
        setIdsSelectionnes(new Set());
        setDerniereLecture(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      } catch (err) {
        if (controleur.signal.aborted || numero !== generation.current) return;
        setErreurChargement(err instanceof Error ? err.message : String(err));
      } finally {
        if (numero === generation.current && !controleur.signal.aborted) setChargement(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    void recharger(filtres, offset);
  }, [filtres, offset, recharger]);

  useEffect(() => () => { generation.current += 1; requete.current?.abort(); }, []);

  useEffect(() => {
    const query = construireQueryLeads(filtres, offset, { leadId: selection?.id });
    window.history.replaceState(window.history.state, '', `/leads?${query}`);
  }, [filtres, offset, selection?.id]);

  function rafraichir() {
    const actuel = etatRequete.current;
    return recharger(actuel.filtres, actuel.offset);
  }

  function executerOuConfirmerAbandon(action: () => void) {
    if (formulaireModifie) setActionAbandon(() => action);
    else {
      setActionAbandon(null);
      action();
    }
  }

  function fermerPanneau() {
    executerOuConfirmerAbandon(() => {
      setFormulaireModifie(false);
      setSelection(null);
      setCreation(false);
    });
  }

  function ouvrirLead(lead: Lead) {
    executerOuConfirmerAbandon(() => {
      setFormulaireModifie(false);
      setCreation(false);
      setSelection(lead);
    });
  }

  function nouvelleFiche() {
    executerOuConfirmerAbandon(() => {
      setSelection(null);
      setFormulaireModifie(false);
      setCreation(true);
    });
  }

  async function copierVue() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/leads?${construireQueryLeads(filtres, offset, { leadId: selection?.id })}`);
      notifier({ ton: 'succes', titre: 'Lien de la vue copié' });
    } catch {
      notifier({ ton: 'erreur', titre: 'Copie impossible', detail: 'Vous pouvez copier directement l’adresse affichée dans le navigateur.' });
    }
  }

  const vueRapide = filtres.pointsExclus ? 'exclus' : filtres.aVerifier === 'true' ? 'a_verifier' : filtres.valides ? 'valides' : filtres.aConfirmer ? 'a_confirmer' : 'tous';

  function choisirVue(id: (typeof VUES_RAPIDES)[number]['id']) {
    setOffset(0);
    setFiltres((f) => ({ ...f, aVerifier: id === 'a_verifier' ? 'true' : '', aConfirmer: id === 'a_confirmer', valides: id === 'valides' || id === 'exclus', pointsExclus: id === 'exclus' }));
  }

  function majFiltre<K extends keyof FiltresVue>(cle: K, valeur: FiltresVue[K]) {
    setOffset(0);
    setFiltres((f) => ({ ...f, [cle]: valeur }));
  }

  function majPeriode(valeur: string) {
    setOffset(0);
    setFiltres((f) => ({ ...f, periode: valeur, periodeActivation: '', dateDebut: '', dateFin: '' }));
  }

  function majDate(cle: 'dateDebut' | 'dateFin', valeur: string) {
    setOffset(0);
    setFiltres((f) => ({ ...f, periode: 'toutes', periodeActivation: '', [cle]: valeur }));
  }

  function basculerDepuisOctobre(actif: boolean) {
    setOffset(0);
    setFiltres((f) => ({
      ...f,
      periode: 'toutes',
      periodeActivation: '',
      dateDebut: actif ? DATE_DEBUT_OCTOBRE : '',
      dateFin: '',
    }));
  }

  const nbFiltresActifs = useMemo(
    () =>
      [filtres.q, filtres.segment, filtres.relation, filtres.statut, filtres.typeDemande, filtres.initiative, filtres.sourceCollecte, filtres.proprietaire, filtres.eligible].filter(Boolean).length +
      (filtres.periode !== 'toutes' ? 1 : 0) +
      (filtres.periodeActivation ? 1 : 0) + (filtres.opportunitesInbound ? 1 : 0) +
      (filtres.dateDebut || filtres.dateFin ? 1 : 0) +
      (filtres.aVerifier ? 1 : 0) + (filtres.aConfirmer ? 1 : 0) + (filtres.valides ? 1 : 0) + (filtres.pointsExclus ? 1 : 0),
    [filtres],
  );

  function reinitialiser() {
    setRecherche('');
    setRechercheProprietaire('');
    setOffset(0);
    setFiltres(filtresVides());
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
      await rafraichir();
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
    if (!window.confirm(`Archiver ${ids.length} lead${ids.length > 1 ? 's' : ''} sélectionné${ids.length > 1 ? 's' : ''} ? Ils seront retirés des tableaux et des points.`)) return;
    setActionGroupee('suppression');
    try {
      const { modifies } = await supprimerSelectionLeads(ids);
      notifier({
        ton: 'succes',
        titre: `${modifies} lead${modifies > 1 ? 's' : ''} archivé${modifies > 1 ? 's' : ''}`,
      });
      await rafraichir();
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
    if (!window.confirm(`Archiver le lead « ${lead.nom ?? lead.email ?? lead.id} » ? Il sera retiré des tableaux et des points.`)) return;
    try {
      const reponse = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
      if (!reponse.ok) throw new Error('Archivage impossible');
      notifier({ ton: 'succes', titre: 'Lead archivé' });
      setFormulaireModifie(false);
      setSelection(null);
      await rafraichir();
    } catch (err) {
      notifier({ ton: 'erreur', titre: 'Archivage impossible', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  const groupesMensuels = useMemo(() => {
    const groupes = new Map<string, Lead[]>();
    for (const lead of leads) {
      const cle = lead.dateReception.slice(0, 7);
      const groupe = groupes.get(cle);
      if (groupe) groupe.push(lead);
      else groupes.set(cle, [lead]);
    }

    const ordre = [...groupes.keys()].sort((a, b) =>
      filtres.tri === 'date_asc' ? a.localeCompare(b) : b.localeCompare(a),
    );
    return ordre.map((cle) => ({
      cle,
      label: formaterMoisAnnee(`${cle}-01`),
      leads: groupes.get(cle) ?? [],
      pointsValides: (groupes.get(cle) ?? []).reduce((s, l) => s + pointsDuLead(l), 0),
      pointsEnAttente: (groupes.get(cle) ?? []).reduce((s, l) => s + (l.pointsConfirmes ? 0 : pointsProposesDuLead(l)), 0),
    }));
  }, [filtres.tri, leads]);

  const lienExport = `/api/export?${construireQueryLeads(filtres, 0, { pagination: false })}`;
  const pointsPage = leads.reduce((s, lead) => s + pointsDuLead(lead), 0);
  const pointsEnAttentePage = leads.reduce((s, lead) => s + (lead.pointsConfirmes ? 0 : pointsProposesDuLead(lead)), 0);
  const interactionBloquee = chargement || Boolean(erreurChargement) || actionGroupee !== null;

  function basculerMois(cle: string) {
    setMoisReplies((actuels) => { const suivants = new Set(actuels); if (suivants.has(cle)) suivants.delete(cle); else suivants.add(cle); return suivants; });
  }

  const alerteModifications = actionAbandon ? (
    <div role="alert" className="shrink-0 border-b border-[var(--warning)] bg-surface-2 px-5 py-3">
      <p className="text-xs font-semibold text-ink">Des modifications ne sont pas enregistrées.</p>
      <p className="mt-1 text-xs text-ink-2">Continuez la modification ou abandonnez uniquement les changements de cette fiche.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Bouton taille="petit" autoFocus onClick={() => setActionAbandon(null)}>Continuer la modification</Bouton>
        <Bouton taille="petit" variante="danger" onClick={() => { const action = actionAbandon; setActionAbandon(null); action(); }}>Abandonner les modifications</Bouton>
      </div>
    </div>
  ) : null;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Registre commercial</p>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Leads entrants</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {chargement ? 'Actualisation des résultats…' : erreurChargement ? 'Résultats précédents · actualisation interrompue' : `${total} lead${total > 1 ? 's' : ''} correspondant aux filtres`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Bouton taille="petit" variante="discret" onClick={() => void copierVue()}>Copier le lien</Bouton>
          <Bouton taille="petit" onClick={() => void rafraichir()} enCours={chargement} disabled={actionGroupee !== null}>Actualiser</Bouton>
          <a
            href={lienExport}
            className="inline-flex h-9 items-center rounded-lg border border-hair-fort px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2"
          >
            Exporter CSV
          </a>
          <Bouton onClick={() => setImportOuvert(true)}>Importer</Bouton>
          <Bouton variante="principal" onClick={nouvelleFiche}>
            Nouveau lead
          </Bouton>
        </div>
      </header>

      <RapportAutomatisation />

      {leadIntrouvable ? <div role="status" className="rounded-lg border border-hair bg-surface-2 px-4 py-3 text-xs text-ink-2">La fiche demandée est introuvable ou a été archivée. Le registre reste accessible ci-dessous.</div> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Vues rapides des leads" className="flex flex-wrap gap-1 rounded-lg border border-hair bg-surface p-1">
          {VUES_RAPIDES.map((vue) => (
            <button key={vue.id} type="button" onClick={() => choisirVue(vue.id)} aria-pressed={vueRapide === vue.id}
              className={clsx('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', vueRapide === vue.id ? 'bg-[var(--s1)] text-white' : 'text-ink-2 hover:bg-surface-2')}>
              {vue.label}
            </button>
          ))}
        </nav>
        <p className="text-[11px] text-ink-muted">Le lien conserve les filtres et la fiche ouverte</p>
      </div>

      <Carte className="px-3 py-2.5">
        {filtres.periodeActivation ? <p className="mb-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">{filtres.opportunitesInbound ? 'Opportunités inbound comptabilisées' : 'Dossiers avec date d’activation'} pendant {filtres.periodeActivation.replace(/(\d{4})-Q([1-4])/, 'T$2 $1')} · la date de réception reste celle du lead initial.</p> : null}
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
          <div className="ml-auto flex items-center gap-2">
            <Bouton variante="discret" taille="petit" aria-expanded={filtresAvances} aria-controls="filtres-avances-leads" onClick={() => setFiltresAvances((v) => !v)}>Filtres détaillés {filtresAvances ? '−' : '+'}</Bouton>
            {nbFiltresActifs > 0 ? (
              <Bouton variante="discret" taille="petit" onClick={reinitialiser}>
                Réinitialiser ({nbFiltresActifs})
              </Bouton>
            ) : null}
            <FiltreSelect
              largeur="w-40"
              label="Tri"
              valeur={filtres.tri}
              onChange={(v) => majFiltre('tri', v as FiltresVue['tri'])}
              options={[
                { valeur: 'date_desc', label: 'Plus récents' },
                { valeur: 'date_asc', label: 'Plus anciens' },
                { valeur: 'points_desc', label: 'Points décroissants' },
                { valeur: 'maj_desc', label: 'Modifiés récemment' },
              ]}
            />
          </div>
        </div>
        {filtresAvances ? <div id="filtres-avances-leads" className="mt-3 flex flex-wrap items-center gap-2 border-t border-hair pt-3">
          <FiltreSelect largeur="w-48" label="Source de collecte" valeur={filtres.sourceCollecte} onChange={(v) => majFiltre('sourceCollecte', v)} vide="Toutes les sources" options={SOURCES_COLLECTE.map((s) => ({ valeur: s, label: LABELS_SOURCE_COLLECTE[s] }))} />
          <FiltreSelect largeur="w-36" label="Relation commerciale" valeur={filtres.relation} onChange={(v) => majFiltre('relation', v)} vide="Toutes relations" options={RELATIONS.map((r) => ({ valeur: r, label: LABELS_RELATION[r] }))} />
          <FiltreSelect largeur="w-40" label="Éligibilité proposée" valeur={filtres.eligible} onChange={(v) => majFiltre('eligible', v as FiltresVue['eligible'])} vide="Toute éligibilité" options={[{ valeur: 'true', label: 'Éligibles' }, { valeur: 'false', label: 'Non éligibles' }]} />
          <FiltreSelect largeur="w-44" label="Vérification" valeur={filtres.aVerifier} onChange={(v) => majFiltre('aVerifier', v as FiltresVue['aVerifier'])} vide="Toute vérification" options={[{ valeur: 'true', label: 'À vérifier' }, { valeur: 'false', label: 'Sans alerte' }]} />
          <FiltreSelect largeur="w-44" label="Confirmation des points" valeur={filtres.valides ? 'true' : filtres.aConfirmer ? 'false' : ''} onChange={(v) => { setOffset(0); setFiltres((f) => ({ ...f, valides: v === 'true', aConfirmer: v === 'false', pointsExclus: false })); }} vide="Toute confirmation" options={[{ valeur: 'true', label: 'Points confirmés' }, { valeur: 'false', label: 'Points non confirmés' }]} />
          <div className="w-48"><Entree value={rechercheProprietaire} onChange={(e) => setRechercheProprietaire(e.target.value)} className="h-8 text-xs" placeholder="Responsable exact…" aria-label="Filtrer par responsable exact" /></div>
        </div> : null}
        {(filtres.sourceCollecte || filtres.proprietaire || filtres.relation || filtres.eligible || filtres.pointsExclus || filtres.aVerifier === 'false') && !filtresAvances ? <p className="mt-2 text-[11px] text-ink-muted">Filtres détaillés actifs : {[
          filtres.sourceCollecte ? `source ${filtres.sourceCollecte.split(',').map((s) => LABELS_SOURCE_COLLECTE[s as SourceCollecte]).join(', ')}` : '',
          filtres.proprietaire ? `responsable ${filtres.proprietaire}` : '', filtres.relation ? `relation ${filtres.relation}` : '',
          filtres.eligible ? (filtres.eligible === 'true' ? 'éligibles' : 'non éligibles') : '', filtres.pointsExclus ? 'exclus confirmés' : '', filtres.aVerifier === 'false' ? 'sans alerte' : '',
        ].filter(Boolean).join(' · ')}</p> : null}
      </Carte>

      <Carte className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hair px-4 py-3">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span className="text-ink-2"><strong className="font-semibold tabulaire">{leads.length}</strong> leads sur cette page</span>
            <span className="text-ink-2"><strong className="font-semibold tabulaire">{formaterPoints(pointsPage)}</strong> points validés sur cette page</span>
            <span className="text-ink-muted"><strong className="font-medium tabulaire">{formaterPoints(pointsEnAttentePage)}</strong> points en attente sur cette page</span>
          </div>
          <div className="flex items-center gap-2">
            <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">{chargement ? <><Spinner /> Chargement…</> : erreurChargement ? 'Actualisation échouée' : derniereLecture ? `Actualisé à ${derniereLecture}` : 'Chargé à l’ouverture'}</span>
            <Bouton taille="petit" variante="discret" onClick={() => setMoisReplies(moisReplies.size > 0 ? new Set() : new Set(groupesMensuels.map((g) => g.cle)))}>{moisReplies.size > 0 ? 'Déplier les mois' : 'Replier les mois'}</Bouton>
          </div>
        </div>
        {erreurChargement ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-hair bg-surface-2 px-4 py-3">
          <p className="text-xs text-[var(--critical)]">{erreurChargement} Les données affichées proviennent du dernier chargement réussi.</p>
          <Bouton taille="petit" onClick={() => void rafraichir()}>Réessayer</Bouton>
        </div> : null}
        {idsSelectionnes.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-hair bg-surface-2 px-4 py-2.5">
            <p className="mr-auto text-xs font-medium text-ink">
              {idsSelectionnes.size} lead{idsSelectionnes.size > 1 ? 's' : ''} sélectionné{idsSelectionnes.size > 1 ? 's' : ''} sur cette page · {formaterPoints(leadsSelectionnes.reduce((s, l) => s + pointsDuLead(l), 0))} points validés
            </p>
            <Bouton
              taille="petit"
              variante="secondaire"
              disabled={idsAConfirmer.length === 0 || interactionBloquee}
              enCours={actionGroupee === 'confirmation'}
              onClick={() => void confirmerEnLot()}
            >
              Confirmer les points{idsAConfirmer.length > 0 ? ` (${idsAConfirmer.length})` : ''}
            </Bouton>
            <Bouton
              taille="petit"
              variante="danger"
              disabled={interactionBloquee}
              enCours={actionGroupee === 'suppression'}
              onClick={() => void supprimerEnLot()}
            >
              Archiver
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
        <div className={clsx('max-h-[72vh] overflow-auto transition-opacity', chargement && 'opacity-60')} aria-busy={chargement}>
          {leads.length === 0 ? (
            <EtatVide
              titre="Aucun lead ne correspond"
              description="Élargissez la période ou réinitialisez les filtres."
              action={
                nbFiltresActifs > 0 ? (
                  <Bouton onClick={reinitialiser}>Réinitialiser les filtres</Bouton>
                ) : (
                  <Bouton variante="principal" onClick={nouvelleFiche}>
                    Ajouter un lead
                  </Bouton>
                )
              }
            />
          ) : (
            <table className="w-full min-w-[1420px] table-fixed text-left text-[13px]">
              <caption className="sr-only">Registre des leads regroupés par mois de réception. Les totaux de chaque mois concernent uniquement cette page. Chaque fiche s’ouvre avec Entrée.</caption>
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-hair text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="w-11 py-2 pl-4 pr-2 font-medium">
                    <input
                      ref={caseToutRef}
                      type="checkbox"
                      checked={tousSelectionnes}
                      onChange={basculerTout}
                      disabled={interactionBloquee}
                      aria-label={tousSelectionnes ? 'Désélectionner tous les leads de cette page' : 'Sélectionner tous les leads de cette page, y compris les mois repliés'}
                      className="h-3.5 w-3.5 cursor-pointer accent-[var(--s1)]"
                    />
                  </th>
                  <th className="w-20 py-2 pr-3 font-medium">Date</th>
                  <th className="w-64 py-2 pr-3 font-medium">Lead / organisation</th>
                  <th className="w-56 py-2 pr-3 font-medium">Contact</th>
                  <th className="w-28 py-2 pr-3 font-medium">Segment</th>
                  <th className="w-56 py-2 pr-3 font-medium">Demande</th>
                  <th className="w-52 py-2 pr-3 font-medium">Initiative</th>
                  <th className="w-28 py-2 pr-3 font-medium">Statut</th>
                  <th className="w-28 py-2 pr-3 font-medium">Responsable</th>
                  <th className="w-20 py-2 pr-4 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {groupesMensuels.map((groupe) => (
                  <Fragment key={groupe.cle}>
                    <tr className="border-y border-hair bg-surface-2/80">
                      <th colSpan={10} scope="rowgroup" className="px-4 py-2 text-left">
                        <button type="button" onClick={() => basculerMois(groupe.cle)} aria-expanded={!moisReplies.has(groupe.cle)} className="flex w-full flex-wrap items-center gap-2 text-left">
                          <span aria-hidden className="w-3 text-ink-muted">{moisReplies.has(groupe.cle) ? '▸' : '▾'}</span>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-2">{groupe.label}</span>
                          <span className="text-[11px] font-normal text-ink-muted">{groupe.leads.length} lead{groupe.leads.length > 1 ? 's' : ''} · {formaterPoints(groupe.pointsValides)} points validés · {formaterPoints(groupe.pointsEnAttente)} en attente — sur cette page</span>
                        </button>
                      </th>
                    </tr>
                    {!moisReplies.has(groupe.cle) ? groupe.leads.map((lead, index) => {
                  const points = pointsDuLead(lead);
                  const pointsProposes = pointsProposesDuLead(lead);
                  const enAttente = lead.validationRequise && !lead.pointsConfirmes;
                  const valideAffiche = lead.pointsConfirmes;
                  return (
                    <tr
                      key={lead.id}
                      id={index === 0 ? `mois-${groupe.cle}` : undefined}
                      tabIndex={0}
                      aria-selected={idsSelectionnes.has(lead.id)}
                      onClick={() => { if (!interactionBloquee) ouvrirLead(lead); }}
                      onKeyDown={(e) => {
                        if (e.currentTarget !== e.target) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (!interactionBloquee) ouvrirLead(lead);
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
                          disabled={interactionBloquee}
                          onChange={() => basculerLead(lead.id)}
                          aria-label={`Sélectionner ${lead.nom ?? lead.societe ?? lead.email ?? 'ce lead'}`}
                          className="h-3.5 w-3.5 cursor-pointer accent-[var(--s1)]"
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-ink-muted tabulaire">
                        {formaterDateCourte(lead.dateReception)}
                      </td>
                      <td className="max-w-64 py-2.5 pr-3">
                        <div className="flex flex-col items-start gap-1">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">
                              {lead.nom ?? lead.societe ?? lead.email ?? 'Sans nom'}
                            </p>
                            <p className="truncate text-xs text-ink-muted">
                              {[lead.societe && lead.nom ? lead.societe : null, lead.ville].filter(Boolean).join(' · ') || 'Organisation non renseignée'}
                            </p>
                          </div>
                          {enAttente ? <Badge ton="attention">à confirmer</Badge> : null}
                          {valideAffiche ? <Badge ton={points > 0 ? 'bon' : 'neutre'}>{points > 0 ? 'validé' : 'exclu confirmé'}</Badge> : null}
                          {lead.aVerifier ? (
                            <Badge ton="attention" icone={<span aria-hidden>!</span>}>
                              à vérifier
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        {lead.email ? <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[var(--s1)] hover:underline" title={lead.email}>{lead.email}</a> : <span className="block text-ink-muted">E-mail manquant</span>}
                        {lead.telephone ? <a href={`tel:${lead.telephone.replace(/[^+\d]/g, '')}`} onClick={(e) => e.stopPropagation()} className="mt-1 block truncate text-ink-2 hover:underline">{lead.telephone}</a> : <span className="mt-1 block text-[11px] text-ink-muted">Téléphone manquant</span>}
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
                      <td className="py-2.5 pr-3 text-xs text-ink-2"><span className="block truncate" title={lead.proprietaire ?? undefined}>{lead.proprietaire ?? 'Non attribué'}</span></td>
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
                    }) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {total > TAILLE_PAGE || offset > 0 ? (
          <div className="flex items-center justify-between border-t border-hair px-4 py-2.5 text-xs text-ink-muted">
            <span className="tabulaire">
              {offset + 1}–{Math.min(offset + TAILLE_PAGE, total)} sur {total}
            </span>
            <div className="flex items-center gap-2">
              {chargement ? <Spinner /> : null}
              <Bouton
                taille="petit"
                disabled={offset === 0 || interactionBloquee}
                onClick={() => setOffset(Math.max(0, offset - TAILLE_PAGE))}
              >
                Précédent
              </Bouton>
              <Bouton
                taille="petit"
                disabled={offset + TAILLE_PAGE >= total || interactionBloquee}
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
                Archiver
              </button>
            </span>
          ) : undefined
        }
        onFermer={fermerPanneau}
      >
        {selection ? (
          <div className="flex h-full flex-col">
          {alerteModifications}
          <div className="min-h-0 flex-1">
          <FormulaireLead
            key={selection.id}
            lead={selection}
            onModificationsChange={setFormulaireModifie}
            onAnnuler={fermerPanneau}
            onEnregistre={() => {
              setFormulaireModifie(false);
              setActionAbandon(null);
              setSelection(null);
              void rafraichir();
            }}
          />
          </div>
          </div>
        ) : null}
      </Panneau>

      <Panneau ouvert={creation} titre="Nouveau lead" onFermer={fermerPanneau}>
        <div className="flex h-full flex-col">
        {alerteModifications}
        <div className="min-h-0 flex-1">
        <FormulaireLead
          lead={null}
          onModificationsChange={setFormulaireModifie}
          onAnnuler={fermerPanneau}
          onEnregistre={() => {
            setFormulaireModifie(false);
            setActionAbandon(null);
            setCreation(false);
            setOffset(0);
            void recharger(etatRequete.current.filtres, 0);
          }}
        />
        </div>
        </div>
      </Panneau>

      <Panneau ouvert={importOuvert} titre="Importer des leads" onFermer={() => setImportOuvert(false)}>
        <ImportCsv
          onTermine={() => {
            setImportOuvert(false);
            setOffset(0);
            void recharger(etatRequete.current.filtres, 0);
          }}
        />
      </Panneau>
    </div>
  );
}
