import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, Carte, EnteteCarte } from '@/components/ui/primitives';
import { TuileStat } from '@/components/indicateurs';
import { lienLeads, type Pilotage } from '@/lib/domain/pilotage';
import { pointsDuLead, type Lead } from '@/lib/domain/lead';
import { LABELS_SEGMENT, LABELS_SOURCE_COLLECTE, LABELS_STATUT, LABELS_TYPE_DEMANDE } from '@/lib/domain/taxonomy';
import { formaterDateCourte, formaterMoisAnnee, formaterPoints } from '@/lib/format';

export function LienIndicateur({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--s1)] [&>div]:h-full [&>div]:transition-colors hover:[&>div]:border-[var(--s1)]"
    >
      {children}
    </Link>
  );
}

export function SynthesePilotage({ pilotage, periode, deltaLeads, deltaPoints }: {
  pilotage: Pilotage;
  periode: string;
  deltaLeads: number | null;
  deltaPoints: number | null;
}) {
  return (
    <section aria-label="Synthèse de la période" className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LienIndicateur href={lienLeads(periode)} label="Consulter tous les leads reçus sur la période">
          <TuileStat libelle="Leads reçus" valeur={pilotage.recus} delta={deltaLeads} aide="Sur la période · voir la liste →" />
        </LienIndicateur>
        <LienIndicateur href={lienLeads(periode, { pointsConfirmes: true })} label="Consulter les décisions validées sur la période">
          <TuileStat libelle="Points validés" valeur={pilotage.pointsValides} unite="pts" delta={deltaPoints}
            aide={`${pilotage.comptabilises} leads comptabilisés · voir →`} accent />
        </LienIndicateur>
        <LienIndicateur href={lienLeads(periode, { pointsConfirmes: false })} label="Examiner les leads dont la décision de comptage reste à confirmer">
          <TuileStat libelle="Points à confirmer" valeur={pilotage.pointsProposes} unite="pts"
            aide={`${pilotage.enAttente} décisions en attente · examiner →`}
            badge={pilotage.enAttente > 0 ? <Badge ton="attention">Proposés</Badge> : undefined} />
        </LienIndicateur>
        <LienIndicateur href={lienLeads(periode, { pointsExclus: true })} label="Consulter les exclusions confirmées sur la période">
          <TuileStat libelle="Exclusions confirmées" valeur={pilotage.exclus} aide="Décisions validées à 0 point · voir →" />
        </LienIndicateur>
      </div>
      <p className="text-[11px] leading-relaxed text-ink-muted">
        Les points proposés restent hors objectifs et primes. Les {pilotage.recus} leads reçus se répartissent entre{' '}
        {pilotage.comptabilises} comptabilisés, {pilotage.enAttente} en attente et {pilotage.exclus} exclus.
      </p>
    </section>
  );
}

export function PrioritesEtQualite({ pilotage, periode }: { pilotage: Pilotage; periode: string }) {
  const controles = [
    { label: 'Identité renseignée', valeur: pilotage.qualite.identites, aide: 'Nom du contact ou de l’organisme' },
    { label: 'Contact exploitable', valeur: pilotage.qualite.contacts, aide: 'E-mail externe ou téléphone hors signature technique' },
    { label: 'Origine détaillée', valeur: pilotage.qualite.origines, aide: 'Initiative connue, ressource et campagne si nécessaires' },
    { label: 'Responsable renseigné', valeur: pilotage.qualite.responsables, aide: 'Dossier attribué à un interlocuteur interne' },
  ];
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[1.45fr_1fr]">
      <Carte>
        <EnteteCarte titre="Actions prioritaires" sousTitre="Dossiers à traiter sur la période, classés par relecture puis ancienneté."
          action={<Badge ton={pilotage.totalActions > 0 ? 'attention' : 'bon'}>{pilotage.totalActions} dossiers</Badge>} />
        <div className="flex flex-wrap gap-2 border-y border-hair bg-surface-2 px-5 py-2.5 text-[11px] text-ink-2">
          <Link href={lienLeads(periode, { aVerifier: true })} className="rounded px-1 py-0.5 hover:underline focus-visible:outline-2">
            {pilotage.aVerifier} à vérifier →
          </Link>
          <span className="text-ink-muted" aria-hidden>·</span>
          <Link href={lienLeads(periode, { pointsConfirmes: false })} className="rounded px-1 py-0.5 hover:underline focus-visible:outline-2">
            {pilotage.enAttente} à confirmer →
          </Link>
          <span className="text-ink-muted" aria-hidden>·</span>
          <span>{pilotage.nonAttribues} dossiers ouverts sans responsable</span>
          <span className="text-ink-muted" aria-hidden>·</span>
          <span>{pilotage.aQualifier} à qualifier commercialement</span>
        </div>
        {pilotage.actions.length === 0 ? (
          <div className="px-5 py-8">
            <p className="text-sm font-medium text-ink">Aucune action signalée</p>
            <p className="mt-1 text-xs text-ink-muted">{pilotage.recus === 0 ? 'La période ne contient pas encore de leads.' : 'Aucun dossier reçu sur la période ne déclenche les contrôles de cette file.'}</p>
          </div>
        ) : (
          <ol className="divide-y divide-hair">
            {pilotage.actions.map((action) => (
              <li key={action.lead.id}>
                <Link href={lienLeads(periode, { leadId: action.lead.id })}
                  className="block px-5 py-3.5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--s1)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">{nomLead(action.lead)} <span className="font-normal text-ink-muted">→</span></p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">{LABELS_TYPE_DEMANDE[action.lead.typeDemande]} · {LABELS_SOURCE_COLLECTE[action.lead.sourceCollecte]} · reçu le {formaterDateCourte(action.lead.dateReception)}</p>
                    </div>
                    <Badge ton={action.priorite === 'haute' ? 'attention' : 'neutre'}>{action.priorite === 'haute' ? 'Prioritaire' : 'À traiter'}</Badge>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{action.raisons.join(' · ')}</p>
                </Link>
              </li>
            ))}
          </ol>
        )}
        {pilotage.totalActions > pilotage.actions.length ? <p className="border-t border-hair px-5 py-3 text-[11px] text-ink-muted">Les 6 premiers dossiers sont affichés. <Link href={lienLeads(periode)} className="font-medium text-[var(--s1)] hover:underline">Explorer tous les leads →</Link></p> : null}
        {pilotage.enAttenteDepuis7Jours > 0 ? <p className="border-t border-hair px-5 py-3 text-xs text-ink-2">{pilotage.enAttenteDepuis7Jours} décision{pilotage.enAttenteDepuis7Jours > 1 ? 's' : ''} encore en attente sur des leads reçus depuis au moins 7 jours.</p> : null}
      </Carte>

      <Carte>
        <EnteteCarte titre="Qualité des données" sousTitre="Complétude observée sur tous les leads reçus, indépendamment de leur score." />
        <div className="px-5 pb-4">
          <div className="flex items-baseline justify-between gap-3 border-b border-hair pb-3">
            <p className="text-3xl font-semibold tracking-tight text-ink tabulaire">{pilotage.qualite.completude === null ? '—' : `${pilotage.qualite.completude} %`}</p>
            <p className="text-xs text-ink-muted">{pilotage.qualite.dossiersComplets} / {pilotage.recus} dossiers complets</p>
          </div>
          <dl className="mt-4 space-y-4">
            {controles.map((controle) => {
              const pourcentage = pilotage.recus > 0 ? Math.round((controle.valeur / pilotage.recus) * 100) : 0;
              return (
                <div key={controle.label}>
                  <div className="flex justify-between gap-3 text-xs">
                    <dt className="font-medium text-ink-2">{controle.label}</dt>
                    <dd className="text-ink tabulaire">{controle.valeur} / {pilotage.recus}</dd>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <div className="h-full rounded-full bg-[var(--s1)]" style={{ width: `${pourcentage}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-ink-muted">{controle.aide}</p>
                </div>
              );
            })}
          </dl>
          <p className="mt-4 border-t border-hair pt-3 text-[11px] leading-relaxed text-ink-muted">Le pourcentage mesure 4 informations renseignées par dossier. Il ne certifie ni leur exactitude ni l’éligibilité aux points.</p>
        </div>
      </Carte>
    </div>
  );
}

export function ActiviteMensuelleEtRecente({ pilotage, periode }: { pilotage: Pilotage; periode: string }) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[1.45fr_1fr]">
      <Carte>
        <EnteteCarte titre="Lecture mensuelle" sousTitre="Leads classés par date de réception, avec les mêmes règles que la synthèse du trimestre." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[590px] text-xs">
            <caption className="sr-only">Leads reçus, points validés, décisions en attente et exclusions par mois de réception</caption>
            <thead className="border-y border-hair bg-surface-2 text-left text-[11px] text-ink-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">Mois de réception</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Reçus</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Points validés</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">À confirmer</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Exclus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {pilotage.mois.map((mois) => {
                const plage = { dateDebut: mois.debut, dateFin: mois.fin };
                return <tr key={mois.mois} className="text-ink-2">
                  <th scope="row" className="px-5 py-3 text-left font-medium"><Link href={lienLeads(periode, plage)} className="rounded underline-offset-4 hover:text-[var(--s1)] hover:underline focus-visible:outline-2">{formaterMoisAnnee(mois.debut)}</Link></th>
                  <td className="px-3 py-3 text-right tabulaire">{mois.recus}</td>
                  <td className="px-3 py-3 text-right tabulaire"><Link href={lienLeads(periode, { ...plage, pointsConfirmes: true })} className="rounded hover:underline focus-visible:outline-2">{formaterPoints(mois.pointsValides)} pts</Link></td>
                  <td className="px-3 py-3 text-right tabulaire"><Link href={lienLeads(periode, { ...plage, pointsConfirmes: false })} className="rounded hover:underline focus-visible:outline-2">{mois.enAttente} <span className="text-ink-muted">· {formaterPoints(mois.pointsProposes)} pts</span></Link></td>
                  <td className="px-5 py-3 text-right tabulaire"><Link href={lienLeads(periode, { ...plage, pointsExclus: true })} className="rounded hover:underline focus-visible:outline-2">{mois.exclus}</Link></td>
                </tr>;
              })}
            </tbody>
            <tfoot className="border-t border-hair bg-surface-2 font-semibold text-ink">
              <tr><th scope="row" className="px-5 py-3 text-left">Total période</th><td className="px-3 py-3 text-right tabulaire">{pilotage.recus}</td><td className="px-3 py-3 text-right tabulaire">{formaterPoints(pilotage.pointsValides)} pts</td><td className="px-3 py-3 text-right tabulaire">{pilotage.enAttente} · {formaterPoints(pilotage.pointsProposes)} pts</td><td className="px-5 py-3 text-right tabulaire">{pilotage.exclus}</td></tr>
            </tfoot>
          </table>
        </div>
      </Carte>

      <Carte>
        <EnteteCarte titre="Derniers leads reçus" sousTitre="Accès direct à la fiche, la qualification et la décision de comptage."
          action={<Link href={lienLeads(periode)} className="text-xs font-medium text-[var(--s1)] hover:underline">Tout voir →</Link>} />
        {pilotage.derniersLeads.length === 0 ? <p className="px-5 pb-6 text-xs text-ink-muted">Aucun lead reçu sur la période.</p> : (
          <ul className="divide-y divide-hair border-t border-hair">
            {pilotage.derniersLeads.map((lead) => <li key={lead.id}>
              <Link href={lienLeads(periode, { leadId: lead.id })} className="block px-5 py-3.5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--s1)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-[13px] font-semibold text-ink">{nomLead(lead)}</p><p className="mt-0.5 truncate text-[11px] text-ink-muted">{LABELS_SEGMENT[lead.segment]} · {lead.ville || lead.societe || 'Organisme / ville non renseigné'}</p></div>
                  <span className="shrink-0 text-[11px] text-ink-muted">{formaterDateCourte(lead.dateReception)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge ton={!lead.pointsConfirmes ? 'attention' : pointsDuLead(lead) > 0 ? 'bon' : 'neutre'}>{!lead.pointsConfirmes ? 'À confirmer' : pointsDuLead(lead) > 0 ? `${formaterPoints(pointsDuLead(lead))} point${pointsDuLead(lead) > 1 ? 's' : ''} validé${pointsDuLead(lead) > 1 ? 's' : ''}` : 'Exclu'}</Badge>
                  <span className="text-[11px] text-ink-muted">{LABELS_STATUT[lead.statut]} · {LABELS_TYPE_DEMANDE[lead.typeDemande]}</span>
                </div>
              </Link>
            </li>)}
          </ul>
        )}
      </Carte>
    </div>
  );
}

function nomLead(lead: Lead): string {
  return lead.nom?.trim() || lead.societe?.trim() || lead.email || 'Contact à identifier';
}
