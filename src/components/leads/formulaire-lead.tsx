'use client';

/** Formulaire de création / édition d'un lead, avec aperçu du score en direct. */
import { useEffect, useMemo, useState } from 'react';
import {
  INITIATIVES,
  LABELS_INITIATIVE,
  LABELS_RELATION,
  LABELS_SEGMENT,
  LABELS_SOURCE_COLLECTE,
  LABELS_STATUT,
  LABELS_TYPE_ACTIVATION,
  LABELS_TYPE_DEMANDE,
  RELATIONS,
  SEGMENTS,
  SOURCES_COLLECTE,
  STATUTS,
  TYPES_ACTIVATION,
  TYPES_DEMANDE,
  type Initiative,
  type Relation,
  type Segment,
  type SourceCollecte,
  type Statut,
  type TypeActivation,
  type TypeDemande,
} from '@/lib/domain/taxonomy';
import { scorerLead } from '@/lib/domain/scoring';
import type { Lead } from '@/lib/domain/lead';
import { Bouton, Champ, Entree, Selection, ZoneTexte } from '@/components/ui/primitives';
import { useToasts } from '@/components/ui/toast';
import { AperçuScore } from './apercu-score';

export interface ValeursLead {
  dateReception: string;
  nom: string;
  email: string;
  telephone: string;
  societe: string;
  fonction: string;
  ville: string;
  segment: Segment;
  relation: Relation;
  typeDemande: TypeDemande;
  initiative: Initiative;
  sourceCollecte: SourceCollecte;
  campagne: string;
  leadMagnet: string;
  message: string;
  statut: Statut;
  typeActivation: TypeActivation | '';
  dateActivation: string;
  proprietaire: string;
  tags: string;
  pointsOverride: string;
  pointsOverrideRaison: string;
  aVerifier: boolean;
}

export function valeursDepuisLead(lead: Lead | null): ValeursLead {
  return {
    dateReception: lead?.dateReception ?? new Date().toISOString().slice(0, 10),
    nom: lead?.nom ?? '',
    email: lead?.email ?? '',
    telephone: lead?.telephone ?? '',
    societe: lead?.societe ?? '',
    fonction: lead?.fonction ?? '',
    ville: lead?.ville ?? '',
    segment: lead?.segment ?? 'b2b',
    relation: lead?.relation ?? 'prospect',
    typeDemande: lead?.typeDemande ?? 'formulaire_contact',
    initiative: lead?.initiative ?? 'inbound_site',
    sourceCollecte: lead?.sourceCollecte ?? 'manuel',
    campagne: lead?.campagne ?? '',
    leadMagnet: lead?.leadMagnet ?? '',
    message: lead?.message ?? '',
    statut: lead?.statut ?? 'nouveau',
    typeActivation: lead?.typeActivation ?? '',
    dateActivation: lead?.dateActivation ?? '',
    proprietaire: lead?.proprietaire ?? '',
    tags: (lead?.tags ?? []).join(', '),
    pointsOverride: lead?.pointsOverride == null ? '' : String(lead.pointsOverride),
    pointsOverrideRaison: lead?.pointsOverrideRaison ?? '',
    aVerifier: lead?.aVerifier ?? false,
  };
}

function vide(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

export function corpsDepuisValeurs(v: ValeursLead): Record<string, unknown> {
  return {
    dateReception: v.dateReception,
    nom: vide(v.nom),
    email: vide(v.email) ?? '',
    telephone: vide(v.telephone),
    societe: vide(v.societe),
    fonction: vide(v.fonction),
    ville: vide(v.ville),
    segment: v.segment,
    relation: v.relation,
    typeDemande: v.typeDemande,
    initiative: v.initiative,
    sourceCollecte: v.sourceCollecte,
    campagne: vide(v.campagne),
    leadMagnet: vide(v.leadMagnet),
    message: vide(v.message),
    statut: v.statut,
    typeActivation: v.typeActivation === '' ? null : v.typeActivation,
    dateActivation: vide(v.dateActivation),
    proprietaire: vide(v.proprietaire),
    tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean),
    pointsOverride: v.pointsOverride === '' ? null : Number(v.pointsOverride),
    pointsOverrideRaison: vide(v.pointsOverrideRaison),
    aVerifier: v.aVerifier,
  };
}

function optionsDe<T extends string>(valeurs: readonly T[], labels: Record<T, string>) {
  return valeurs.map((v) => (
    <option key={v} value={v}>
      {labels[v]}
    </option>
  ));
}

export function FormulaireLead({
  lead,
  onEnregistre,
  onAnnuler,
}: {
  lead: Lead | null;
  onEnregistre: (lead: Lead) => void;
  onAnnuler: () => void;
}) {
  const [v, setV] = useState<ValeursLead>(() => valeursDepuisLead(lead));
  const [enCours, setEnCours] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const { notifier } = useToasts();

  useEffect(() => setV(valeursDepuisLead(lead)), [lead]);

  const score = useMemo(
    () =>
      scorerLead({
        segment: v.segment,
        relation: v.relation,
        typeDemande: v.typeDemande,
        initiative: v.initiative,
      }),
    [v.segment, v.relation, v.typeDemande, v.initiative],
  );
  const scoreModifie = Boolean(lead && (
    v.segment !== lead.segment ||
    v.relation !== lead.relation ||
    v.typeDemande !== lead.typeDemande ||
    v.initiative !== lead.initiative ||
    (v.pointsOverride === '' ? null : Number(v.pointsOverride)) !== lead.pointsOverride
  ));
  const confirmationDisponible = Boolean(lead?.validationRequise && (!lead.pointsConfirmes || scoreModifie));

  function set<K extends keyof ValeursLead>(cle: K, valeur: ValeursLead[K]) {
    setV((prev) => ({ ...prev, [cle]: valeur }));
  }

  async function enregistrer(confirmer: boolean) {
    setEnCours(true);
    setErreurs({});
    try {
      const reponse = await fetch(lead ? `/api/leads/${lead.id}` : '/api/leads', {
        method: lead ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...corpsDepuisValeurs(v), dedupliquer: false }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        if (Array.isArray(data?.details)) {
          const map: Record<string, string> = {};
          for (const d of data.details) map[d.champ] = d.message;
          setErreurs(map);
        }
        notifier({ ton: 'erreur', titre: 'Enregistrement refusé', detail: data?.erreur ?? 'Erreur inconnue' });
        return;
      }
      let resultat = lead ? (data as Lead) : (data.lead as Lead);
      if (confirmer && lead) {
        const confirmation = await fetch(`/api/leads/${lead.id}/confirmer`, { method: 'POST' });
        const donneesConfirmation = await confirmation.json();
        if (!confirmation.ok) throw new Error(donneesConfirmation?.erreur ?? 'Confirmation impossible');
        resultat = donneesConfirmation as Lead;
      }
      notifier({
        ton: 'succes',
        titre: confirmer ? 'Points confirmés et comptabilisés' : lead ? 'Lead mis à jour' : 'Lead créé',
      });
      onEnregistre(resultat);
    } catch (err) {
      notifier({ ton: 'erreur', titre: 'Erreur réseau', detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setEnCours(false);
    }
  }

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    void enregistrer(false);
  }

  return (
    <form onSubmit={soumettre} className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <AperçuScore
          score={score}
          pointsForces={v.pointsOverride === '' ? null : Number(v.pointsOverride)}
          enAttente={Boolean(lead?.validationRequise && !lead.pointsConfirmes)}
        />

        {lead?.rawPayload ? (
          <section className="space-y-2 rounded-lg border border-hair bg-surface-2 p-3.5">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Détails reçus de l’automatisation
            </h3>
            <p className="text-xs text-ink-2">Source : {LABELS_SOURCE_COLLECTE[lead.sourceCollecte]}</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface px-3 py-2 text-xs text-ink-2">
              {JSON.stringify(lead.rawPayload, null, 2)}
            </pre>
          </section>
        ) : null}

        <section className="space-y-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Qualification</h3>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Segment" erreur={erreurs['segment']}>
              <Selection value={v.segment} onChange={(e) => set('segment', e.target.value as Segment)}>
                {optionsDe(SEGMENTS, LABELS_SEGMENT)}
              </Selection>
            </Champ>
            <Champ label="Relation" erreur={erreurs['relation']}>
              <Selection value={v.relation} onChange={(e) => set('relation', e.target.value as Relation)}>
                {optionsDe(RELATIONS, LABELS_RELATION)}
              </Selection>
            </Champ>
            <Champ label="Type de demande" erreur={erreurs['typeDemande']}>
              <Selection value={v.typeDemande} onChange={(e) => set('typeDemande', e.target.value as TypeDemande)}>
                {optionsDe(TYPES_DEMANDE, LABELS_TYPE_DEMANDE)}
              </Selection>
            </Champ>
            <Champ label="Initiative" erreur={erreurs['initiative']}>
              <Selection value={v.initiative} onChange={(e) => set('initiative', e.target.value as Initiative)}>
                {optionsDe(INITIATIVES, LABELS_INITIATIVE)}
              </Selection>
            </Champ>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Contact</h3>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Nom" erreur={erreurs['nom']} className="col-span-2">
              <Entree value={v.nom} onChange={(e) => set('nom', e.target.value)} placeholder="Marie Dupont" />
            </Champ>
            <Champ label="E-mail" erreur={erreurs['email']}>
              <Entree
                type="email"
                value={v.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="m.dupont@mairie-lyon.fr"
              />
            </Champ>
            <Champ label="Téléphone" erreur={erreurs['telephone']}>
              <Entree value={v.telephone} onChange={(e) => set('telephone', e.target.value)} placeholder="06 12 34 56 78" />
            </Champ>
            <Champ label="Société / organisme" erreur={erreurs['societe']}>
              <Entree value={v.societe} onChange={(e) => set('societe', e.target.value)} placeholder="Mairie de Lyon" />
            </Champ>
            <Champ label="Fonction" erreur={erreurs['fonction']}>
              <Entree value={v.fonction} onChange={(e) => set('fonction', e.target.value)} />
            </Champ>
            <Champ label="Ville" erreur={erreurs['ville']}>
              <Entree value={v.ville} onChange={(e) => set('ville', e.target.value)} />
            </Champ>
            <Champ label="Date de réception" erreur={erreurs['dateReception']}>
              <Entree type="date" value={v.dateReception} onChange={(e) => set('dateReception', e.target.value)} />
            </Champ>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Contexte</h3>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Canal de collecte" erreur={erreurs['sourceCollecte']}>
              <Selection
                value={v.sourceCollecte}
                onChange={(e) => set('sourceCollecte', e.target.value as SourceCollecte)}
              >
                {optionsDe(SOURCES_COLLECTE, LABELS_SOURCE_COLLECTE)}
              </Selection>
            </Champ>
            <Champ label="Campagne" aide="Nom de la campagne ou de l’édition newsletter">
              <Entree value={v.campagne} onChange={(e) => set('campagne', e.target.value)} />
            </Champ>
            <Champ label="Lead magnet" aide="Contenu téléchargé" className="col-span-2">
              <Entree value={v.leadMagnet} onChange={(e) => set('leadMagnet', e.target.value)} />
            </Champ>
            <Champ label="Message" className="col-span-2">
              <ZoneTexte value={v.message} onChange={(e) => set('message', e.target.value)} rows={3} />
            </Champ>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Suivi</h3>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Statut">
              <Selection value={v.statut} onChange={(e) => set('statut', e.target.value as Statut)}>
                {optionsDe(STATUTS, LABELS_STATUT)}
              </Selection>
            </Champ>
            <Champ label="Type d’activation" aide="Renseigner pour une opportunité">
              <Selection
                value={v.typeActivation}
                onChange={(e) => set('typeActivation', e.target.value as TypeActivation | '')}
              >
                <option value="">—</option>
                {optionsDe(TYPES_ACTIVATION, LABELS_TYPE_ACTIVATION)}
              </Selection>
            </Champ>
            <Champ label="Date d’activation" erreur={erreurs['dateActivation']}>
              <Entree
                type="date"
                value={v.dateActivation}
                onChange={(e) => set('dateActivation', e.target.value)}
              />
            </Champ>
            <Champ label="Propriétaire">
              <Entree value={v.proprietaire} onChange={(e) => set('proprietaire', e.target.value)} />
            </Champ>
            <Champ label="Tags" aide="Séparés par des virgules" className="col-span-2">
              <Entree value={v.tags} onChange={(e) => set('tags', e.target.value)} />
            </Champ>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Arbitrage manuel
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Points forcés" aide="Prime sur le calcul automatique" erreur={erreurs['pointsOverride']}>
              <Selection value={v.pointsOverride} onChange={(e) => set('pointsOverride', e.target.value)}>
                <option value="">Aucun (score automatique)</option>
                <option value="0">0 point</option>
                <option value="0.5">0,5 point</option>
                <option value="1">1 point</option>
              </Selection>
            </Champ>
            <Champ label="Raison de l’arbitrage">
              <Entree
                value={v.pointsOverrideRaison}
                onChange={(e) => set('pointsOverrideRaison', e.target.value)}
                placeholder="Validé avec Mehdi le…"
              />
            </Champ>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input
              type="checkbox"
              checked={v.aVerifier}
              onChange={(e) => set('aVerifier', e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--s1)]"
            />
            Marquer comme « à vérifier »
          </label>
        </section>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-hair px-5 py-3">
        <Bouton type="button" variante="discret" onClick={onAnnuler}>
          Annuler
        </Bouton>
        <Bouton type="submit" variante={confirmationDisponible ? 'secondaire' : 'principal'} enCours={enCours}>
          {lead ? (confirmationDisponible ? 'Enregistrer sans confirmer' : 'Enregistrer') : 'Créer le lead'}
        </Bouton>
        {confirmationDisponible ? (
          <Bouton type="button" variante="principal" enCours={enCours} onClick={() => void enregistrer(true)}>
            Enregistrer et confirmer les points
          </Bouton>
        ) : null}
      </div>
    </form>
  );
}
