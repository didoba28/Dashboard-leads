import type { Lead } from '@/lib/domain/lead';
import { LABELS_SOURCE_COLLECTE } from '@/lib/domain/taxonomy';
import { extraireDetailsFormulaireEmail } from '@/lib/ingest/email-details';
import { extraireDetailsSlack, texteDepuisBlocsSlack } from '@/lib/ingest/slack-content';
import { Badge } from '@/components/ui/primitives';

type Objet = Record<string, unknown>;

function objet(valeur: unknown): Objet | null {
  return valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur) ? (valeur as Objet) : null;
}

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null;
}

function Information({ libelle, valeur }: { libelle: string; valeur: string | null }) {
  if (!valeur) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">{libelle}</dt>
      <dd className="mt-0.5 break-words text-xs text-ink">{valeur}</dd>
    </div>
  );
}

export function DetailsAutomatisation({ lead }: { lead: Lead }) {
  const brut = objet(lead.rawPayload);
  if (!brut) return null;

  const donnees = objet(brut['donnees']);
  const corps = texte(donnees?.['corpsTexte']) ?? texte(brut['corpsTexte']) ?? texte(brut['texte']);
  const evenement = objet(brut['evenement']);
  const evenementInterne = objet(evenement?.['event']);
  const botProfile = objet(evenement?.['bot_profile']) ?? objet(evenementInterne?.['bot_profile']);
  const contenuSlack = [
    brut['blocs'],
    brut['attachments'],
    evenement?.['blocks'],
    evenement?.['attachments'],
    evenementInterne?.['blocks'],
    evenementInterne?.['attachments'],
  ].filter((valeur) => valeur != null);
  const texteBlocsSlack = texteDepuisBlocsSlack(contenuSlack);
  const estSlack = lead.sourceCollecte === 'slack_inbound';
  const corpsSlack = [corps, texteBlocsSlack].filter(Boolean).join('\n');
  const corpsAffiche = estSlack ? corpsSlack : corps;
  const formulaire = !estSlack && corps ? extraireDetailsFormulaireEmail(corps) : null;
  const detailsSlack = estSlack ? extraireDetailsSlack(corpsSlack) : [];
  const origineSlack = estSlack
    ? texte(evenement?.['origine']) ??
      texte(evenement?.['formName']) ??
      texte(evenement?.['formulaire']) ??
      texte(evenement?.['botName']) ??
      texte(evenement?.['appName']) ??
      texte(evenement?.['username']) ??
      texte(botProfile?.['name']) ??
      lead.leadMagnet
    : null;
  const sujet = texte(brut['sujet']) ?? texte(donnees?.['sujet']);
  const expediteur = texte(brut['expediteur']) ?? texte(donnees?.['expediteur']);
  const messageId = texte(brut['messageId']) ?? texte(donnees?.['messageId']);
  const nom = [formulaire?.prenom, formulaire?.nom].filter(Boolean).join(' ') || null;

  return (
    <section className="space-y-3 rounded-lg border border-hair bg-surface-2 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Détails reçus</h3>
        <Badge ton="info">{LABELS_SOURCE_COLLECTE[lead.sourceCollecte]}</Badge>
      </div>

      {(sujet || expediteur) ? (
        <dl className="grid gap-3 rounded-md border border-hair bg-surface px-3 py-2.5 sm:grid-cols-2">
          <Information libelle="Sujet" valeur={sujet} />
          <Information libelle="Transmis par" valeur={expediteur} />
        </dl>
      ) : null}

      {estSlack && (origineSlack || detailsSlack.length > 0) ? (
        <div className="space-y-3 rounded-md border border-[color-mix(in_srgb,var(--s1)_25%,var(--hair))] bg-surface p-3">
          <Information libelle="Automatisation / formulaire Slack" valeur={origineSlack} />
          {detailsSlack.length > 0 ? (
            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {detailsSlack.map((detail, index) => (
                <Information key={`${detail.libelle}-${index}`} libelle={detail.libelle} valeur={detail.valeur} />
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}

      {!estSlack && formulaire ? (
        <div className="space-y-3 rounded-md border border-[color-mix(in_srgb,var(--s1)_25%,var(--hair))] bg-surface p-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">Contact du formulaire</p>
            <p className="mt-1 text-sm font-semibold text-ink">{nom ?? 'Contact non identifié'}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {formulaire.email ? (
                <a className="text-[var(--s1)] hover:underline" href={`mailto:${formulaire.email}`}>
                  {formulaire.email}
                </a>
              ) : null}
              {formulaire.telephone ? (
                <a className="text-[var(--s1)] hover:underline" href={`tel:${formulaire.telephone.replace(/\s/g, '')}`}>
                  {formulaire.telephone}
                </a>
              ) : null}
            </div>
          </div>

          {formulaire.message ? (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">Demande</p>
              <p className="mt-1 max-h-56 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-ink-2">
                {formulaire.message}
              </p>
            </div>
          ) : null}

          <Information libelle="Comment cette personne connaît AirFit" valeur={formulaire.origine} />
        </div>
      ) : !estSlack && corpsAffiche ? (
        <div className="rounded-md border border-hair bg-surface p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">Message reçu</p>
          <p className="mt-1 max-h-56 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-ink-2">{corpsAffiche}</p>
        </div>
      ) : null}

      {estSlack && corpsAffiche ? (
        <details className="rounded-md border border-hair bg-surface">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink">
            Voir le message Slack complet
          </summary>
          <p className="max-h-72 overflow-y-auto whitespace-pre-line border-t border-hair px-3 py-2.5 text-xs leading-relaxed text-ink-2">
            {corpsAffiche}
          </p>
        </details>
      ) : null}

      <details className="rounded-md border border-hair bg-surface">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink">
          Afficher les données techniques brutes
        </summary>
        <div className="border-t border-hair px-3 py-2">
          {messageId ? <p className="mb-2 text-[11px] text-ink-muted">Identifiant du message : {messageId}</p> : null}
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink-muted">
            {JSON.stringify(lead.rawPayload, null, 2)}
          </pre>
        </div>
      </details>
    </section>
  );
}
