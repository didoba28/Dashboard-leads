/** Règles de comptage : la référence écrite, et le moteur qui les applique. */
import { REGLES } from '@/lib/domain/scoring';
import { lireReglages } from '@/lib/db/settings';
import { Badge, Carte, EnteteCarte } from '@/components/ui/primitives';
import { Simulateur } from '@/components/regles/simulateur';

export const dynamic = 'force-dynamic';

const COMPTE_COMME_LEAD = [
  'Nouveau prospect entrant via lead magnet, formulaire ou site internet',
  'Appel entrant issu du site internet',
  'Téléchargement du Livre Blanc, d’un catalogue, ou simulateur rempli depuis le site',
  'Prospect collectivité non client ayant téléchargé une fiche technique',
];

const NE_COMPTE_PAS = [
  'Distributeur qui télécharge une fiche technique',
  'Renouvellement client',
  'Compte déjà client (la règle ne retient que les prospects « ni client, ni distributeur »)',
];

const GRILLE = [
  {
    points: '1 point',
    ton: 'bon' as const,
    cas: [
      'Demande entrante via formulaire d’un B2B : demande de prix ou de renseignements, d’un prospect qui n’est ni client ni distributeur existant',
      'Téléchargement d’une fiche technique par un prospect B2B qui n’est pas client',
      'Lead magnet poussé dans la Newsletter (initiative issue exclusivement du pôle Growth)',
    ],
  },
  {
    points: '0,5 point',
    ton: 'attention' as const,
    cas: [
      'Demande entrante via formulaire d’un prospect B2C',
      'Lead magnet poussé par une initiative outbound : campagne de prospection ou BDR',
    ],
  },
];

export default async function PageRegles() {
  const reglages = lireReglages();

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-ink">Règles de comptage</h1>
        <p className="mt-0.5 max-w-3xl text-xs text-ink-muted">
          Ces règles sont appliquées automatiquement à chaque lead, à l’enregistrement comme à la
          modification. Chaque lead conserve l’identifiant de la règle qui l’a scoré : tout point
          affiché sur le dashboard est justifiable.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Carte>
          <EnteteCarte titre="Sont considérés comme leads entrants" />
          <ul className="space-y-2 px-5 pb-5 text-xs text-ink-2">
            {COMPTE_COMME_LEAD.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-[var(--good-texte)]">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Carte>
        <Carte>
          <EnteteCarte titre="Ne sont pas considérés comme leads entrants" />
          <ul className="space-y-2 px-5 pb-5 text-xs text-ink-2">
            {NE_COMPTE_PAS.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-[var(--critical)]">
                  ✕
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Carte>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {GRILLE.map((bloc) => (
          <Carte key={bloc.points}>
            <EnteteCarte titre="Système de points" action={<Badge ton={bloc.ton}>{bloc.points}</Badge>} />
            <ul className="space-y-2 px-5 pb-5 text-xs text-ink-2">
              {bloc.cas.map((cas) => (
                <li key={cas} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 text-ink-muted">
                    •
                  </span>
                  {cas}
                </li>
              ))}
            </ul>
          </Carte>
        ))}
      </div>

      <Carte>
        <EnteteCarte
          titre="Règle d’attribution des activations"
          sousTitre="Ce qui alimente — ou non — le compteur d’opportunités inbound"
        />
        <div className="px-5 pb-5 text-xs text-ink-2">
          <p>
            Un lead ayant rempli un lead magnet servi par une initiative outbound compte pour{' '}
            <strong className="font-medium text-ink">0,5 dans les objectifs quanti</strong>, mais n’est{' '}
            <strong className="font-medium text-ink">jamais comptabilisé</strong> dans les leads activés
            ou réactivés par l’inbound. Toutes les autres origines y sont éligibles dès que le lead
            passe au statut « Activé » ou « Réactivé ».
          </p>
        </div>
      </Carte>

      <Carte>
        <EnteteCarte
          titre="Ordre d’évaluation du moteur"
          sousTitre="La première règle dont la condition est vraie décide — les exclusions passent avant tout"
        />
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-hair text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Règle</th>
                <th className="py-2 pr-3 font-medium">Identifiant</th>
              </tr>
            </thead>
            <tbody>
              {REGLES.map((regle, i) => (
                <tr key={regle.id} className="border-b border-hair/60 last:border-0">
                  <td className="py-2 pr-3 text-ink-muted tabulaire">{i + 1}</td>
                  <td className="py-2 pr-3 text-ink">{regle.label}</td>
                  <td className="py-2 pr-3">
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">{regle.id}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Carte>

      <Simulateur arbitrage={reglages.arbitrageB2cNewsletter} />
    </div>
  );
}
