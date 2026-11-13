import Link from 'next/link';
import { Badge, Carte, EnteteCarte } from '@/components/ui/primitives';
import { lienLeads, type Pilotage } from '@/lib/domain/pilotage';
import { pointsDuLead, type Lead } from '@/lib/domain/lead';
import { LABELS_TYPE_DEMANDE } from '@/lib/domain/taxonomy';
import { formaterDateCourte, formaterMoisAnnee, formaterPoints } from '@/lib/format';

const lienAction = 'inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-s1 hover:bg-surface-2';

export function ActionsPrioritaires({ pilotage, periode }: { pilotage: Pilotage; periode: string }) {
  return (
    <div className="space-y-3 px-4 pb-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {pilotage.aVerifier > 0 ? <Link href={lienLeads(periode, { aVerifier: true })} className={lienAction}>{pilotage.aVerifier} à vérifier</Link> : null}
        {pilotage.enAttente > 0 ? <Link href={lienLeads(periode, { pointsConfirmes: false })} className={lienAction}>{pilotage.enAttente} à confirmer</Link> : null}
        <Link href={lienLeads(periode)} className={lienAction}>Tous les leads</Link>
      </div>
      {pilotage.actions.length === 0 ? <p className="px-3 pb-2 text-sm text-ink-muted">Aucun dossier à traiter sur cette période.</p> : (
        <ol className="divide-y divide-hair border-t border-hair">
          {pilotage.actions.map(({ lead, raisons }) => (
            <li key={lead.id}>
              <Link href={lienLeads(periode, { leadId: lead.id })} className="flex items-center justify-between gap-4 rounded-lg px-3 py-3 hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{nomLead(lead)}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{raisons[0]}</span>
                </span>
                <span className="shrink-0 text-xs tabulaire text-ink-muted">{formaterDateCourte(lead.dateReception)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {pilotage.totalActions > pilotage.actions.length ? <p className="px-3 text-xs text-ink-muted">{pilotage.actions.length} dossiers affichés sur {pilotage.totalActions}.</p> : null}
    </div>
  );
}

export function QualiteDonnees({ pilotage }: { pilotage: Pilotage }) {
  const mesures = [
    ['Identité', pilotage.qualite.identites],
    ['Contact exploitable', pilotage.qualite.contacts],
    ['Origine détaillée', pilotage.qualite.origines],
    ['Responsable', pilotage.qualite.responsables],
  ] as const;
  return (
    <Carte>
      <EnteteCarte titre="Qualité des données" sousTitre={`${pilotage.qualite.dossiersComplets} dossier(s) complet(s) sur ${pilotage.recus}`} />
      <dl className="grid grid-cols-2 gap-3 px-5 pb-5 text-sm lg:grid-cols-4">
        {mesures.map(([label, valeur]) => <div key={label}><dt className="text-ink-muted">{label}</dt><dd className="mt-1 font-semibold tabulaire text-ink">{valeur} / {pilotage.recus}</dd></div>)}
      </dl>
    </Carte>
  );
}

export function ActiviteMensuelleEtRecente({ pilotage, periode }: { pilotage: Pilotage; periode: string }) {
  return (
  <Carte>
    <EnteteCarte titre="Par mois de réception" />
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
  );
}

export function DerniersLeads({ pilotage, periode }: { pilotage: Pilotage; periode: string }) {
  return (
    <section aria-labelledby="derniers-leads" className="overflow-hidden rounded-xl border border-hair bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <h2 id="derniers-leads" className="text-base font-semibold text-ink">Derniers leads</h2>
        <Link href={lienLeads(periode)} className="text-sm font-medium text-s1 hover:underline">Tout voir</Link>
      </div>
      {pilotage.derniersLeads.length === 0 ? <p className="border-t border-hair px-5 py-5 text-sm text-ink-muted">Aucun lead reçu sur cette période.</p> : (
        <ul className="divide-y divide-hair border-t border-hair">
          {pilotage.derniersLeads.map((lead) => {
            const points = pointsDuLead(lead);
            return (
              <li key={lead.id}>
                <Link href={lienLeads(periode, { leadId: lead.id })} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2 focus-visible:outline-offset-[-3px] sm:px-5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{nomLead(lead)}</span>
                    <span className="block truncate text-xs text-ink-muted">{LABELS_TYPE_DEMANDE[lead.typeDemande]} · {formaterDateCourte(lead.dateReception)}</span>
                  </span>
                  <Badge ton={!lead.pointsConfirmes ? 'attention' : points > 0 ? 'bon' : 'neutre'}>{!lead.pointsConfirmes ? 'À confirmer' : points > 0 ? `${formaterPoints(points)} pt${points > 1 ? 's' : ''}` : 'Exclu'}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function nomLead(lead: Lead): string {
  return lead.nom?.trim() || lead.societe?.trim() || lead.email || 'Contact à identifier';
}
