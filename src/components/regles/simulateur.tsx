'use client';

/** Simulateur de règles : « ce lead, il vaut combien ? », sans rien écrire. */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  INITIATIVES,
  LABELS_INITIATIVE,
  LABELS_RELATION,
  LABELS_SEGMENT,
  LABELS_TYPE_DEMANDE,
  RELATIONS,
  SEGMENTS,
  TYPES_DEMANDE,
  type Initiative,
  type Relation,
  type Segment,
  type TypeDemande,
} from '@/lib/domain/taxonomy';
import { scorerLead, type ArbitrageB2cNewsletter } from '@/lib/domain/scoring';
import { Bouton, Carte, Champ, EnteteCarte, Selection } from '@/components/ui/primitives';
import { AperçuScore } from '@/components/leads/apercu-score';
import { useToasts } from '@/components/ui/toast';

const EXEMPLES: Array<{ titre: string; entree: { segment: Segment; relation: Relation; typeDemande: TypeDemande; initiative: Initiative } }> = [
  {
    titre: 'Mairie qui télécharge une fiche technique',
    entree: { segment: 'collectivite', relation: 'prospect', typeDemande: 'fiche_technique', initiative: 'inbound_site' },
  },
  {
    titre: 'Livre blanc servi par une campagne outbound',
    entree: { segment: 'b2b', relation: 'prospect', typeDemande: 'livre_blanc', initiative: 'outbound_campagne' },
  },
  {
    titre: 'Même livre blanc, poussé en newsletter',
    entree: { segment: 'b2b', relation: 'prospect', typeDemande: 'livre_blanc', initiative: 'newsletter' },
  },
  {
    titre: 'Particulier via le formulaire du site',
    entree: { segment: 'b2c', relation: 'prospect', typeDemande: 'formulaire_contact', initiative: 'inbound_site' },
  },
  {
    titre: 'Distributeur qui télécharge une fiche technique',
    entree: { segment: 'b2b', relation: 'distributeur', typeDemande: 'fiche_technique', initiative: 'inbound_site' },
  },
  {
    titre: 'Renouvellement client',
    entree: { segment: 'b2b', relation: 'client', typeDemande: 'renouvellement_client', initiative: 'inbound_site' },
  },
];

export function Simulateur({ arbitrage }: { arbitrage: ArbitrageB2cNewsletter }) {
  const [segment, setSegment] = useState<Segment>('collectivite');
  const [relation, setRelation] = useState<Relation>('prospect');
  const [typeDemande, setTypeDemande] = useState<TypeDemande>('fiche_technique');
  const [initiative, setInitiative] = useState<Initiative>('inbound_site');
  const [option, setOption] = useState<ArbitrageB2cNewsletter>(arbitrage);
  const [enCours, setEnCours] = useState(false);
  const { notifier } = useToasts();
  const router = useRouter();

  const score = useMemo(
    () => scorerLead({ segment, relation, typeDemande, initiative }, { arbitrageB2cNewsletter: option }),
    [segment, relation, typeDemande, initiative, option],
  );

  async function enregistrerArbitrage() {
    setEnCours(true);
    try {
      const reponse = await fetch('/api/reglages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arbitrageB2cNewsletter: option }),
      });
      const data = await reponse.json();
      if (!reponse.ok) throw new Error(data?.erreur ?? 'Enregistrement impossible');
      notifier({
        ton: 'succes',
        titre: 'Arbitrage enregistré',
        detail: data.leadsRescores > 0 ? `${data.leadsRescores} lead(s) recalculé(s).` : 'Aucun lead impacté.',
      });
      router.refresh();
    } catch (err) {
      notifier({
        ton: 'erreur',
        titre: 'Enregistrement impossible',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Carte>
        <EnteteCarte titre="Simulateur" sousTitre="Combien vaut ce lead selon les règles en vigueur ?" />
        <div className="space-y-3 px-5 pb-5">
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Segment">
              <Selection value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>
                    {LABELS_SEGMENT[s]}
                  </option>
                ))}
              </Selection>
            </Champ>
            <Champ label="Relation">
              <Selection value={relation} onChange={(e) => setRelation(e.target.value as Relation)}>
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {LABELS_RELATION[r]}
                  </option>
                ))}
              </Selection>
            </Champ>
            <Champ label="Type de demande">
              <Selection value={typeDemande} onChange={(e) => setTypeDemande(e.target.value as TypeDemande)}>
                {TYPES_DEMANDE.map((t) => (
                  <option key={t} value={t}>
                    {LABELS_TYPE_DEMANDE[t]}
                  </option>
                ))}
              </Selection>
            </Champ>
            <Champ label="Initiative">
              <Selection value={initiative} onChange={(e) => setInitiative(e.target.value as Initiative)}>
                {INITIATIVES.map((i) => (
                  <option key={i} value={i}>
                    {LABELS_INITIATIVE[i]}
                  </option>
                ))}
              </Selection>
            </Champ>
          </div>

          <AperçuScore score={score} />

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Cas d’école
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EXEMPLES.map((ex) => (
                <button
                  key={ex.titre}
                  type="button"
                  onClick={() => {
                    setSegment(ex.entree.segment);
                    setRelation(ex.entree.relation);
                    setTypeDemande(ex.entree.typeDemande);
                    setInitiative(ex.entree.initiative);
                  }}
                  className="rounded-md border border-hair-fort px-2 py-1 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {ex.titre}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Carte>

      <Carte className="h-fit">
        <EnteteCarte
          titre="Arbitrage : newsletter × B2C"
          sousTitre="Le seul cas où les règles écrites se recoupent"
        />
        <div className="space-y-3 px-5 pb-5">
          <p className="text-xs text-ink-2">
            Un lead magnet poussé en newsletter « compte pour 1 », mais la grille de points donne 0,5
            à une demande entrante B2C. Pour un particulier arrivé par la newsletter, il faut trancher.
            Le choix s’applique à tous les leads, y compris ceux déjà enregistrés.
          </p>
          <div className="space-y-2">
            {(
              [
                {
                  valeur: 'newsletter' as const,
                  titre: 'L’initiative prime — 1 point',
                  detail: 'La newsletter est une initiative 100 % Growth : elle vaut 1 point quel que soit le segment.',
                },
                {
                  valeur: 'segment' as const,
                  titre: 'Le segment prime — 0,5 point',
                  detail: 'La grille de points s’applique d’abord : un B2C vaut 0,5 point, même via la newsletter.',
                },
              ]
            ).map((choix) => (
              <label
                key={choix.valeur}
                className={
                  'flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ' +
                  (option === choix.valeur
                    ? 'border-[var(--s1)] bg-[color-mix(in_srgb,var(--s1)_7%,transparent)]'
                    : 'border-hair-fort hover:bg-surface-2')
                }
              >
                <input
                  type="radio"
                  name="arbitrage"
                  checked={option === choix.valeur}
                  onChange={() => setOption(choix.valeur)}
                  className="mt-0.5 accent-[var(--s1)]"
                />
                <span>
                  <span className="block text-[13px] font-medium text-ink">{choix.titre}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{choix.detail}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <Bouton
              variante="principal"
              onClick={enregistrerArbitrage}
              enCours={enCours}
              disabled={option === arbitrage}
            >
              {option === arbitrage ? 'Arbitrage actuel' : 'Appliquer et recalculer'}
            </Bouton>
          </div>
        </div>
      </Carte>
    </div>
  );
}
