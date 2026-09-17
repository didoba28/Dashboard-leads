/** Intégrations : Notion, Slack, Webflow, Make, e-mails et import CSV. */
import { headers } from 'next/headers';
import { etatNotion } from '@/lib/notion/sync';
import { PanneauNotion } from '@/components/integrations/panneau-notion';
import { BlocCode } from '@/components/integrations/bloc-code';
import { Badge, Carte, EnteteCarte } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';

export default async function PageIntegrations() {
  const etat = await etatNotion();
  const entetes = await headers();
  const protocole = entetes.get('x-forwarded-proto') ?? 'http';
  const hote = entetes.get('x-forwarded-host') ?? entetes.get('host') ?? 'localhost:3000';
  const base = process.env.APP_URL ?? `${protocole}://${hote}`;
  const slackConfigure = Boolean(process.env.SLACK_SIGNING_SECRET);
  const ingestionConfiguree = Boolean(process.env.INGEST_TOKEN);
  const webflowConfigure = Boolean(process.env.WEBFLOW_WEBHOOK_SECRET);
  const cronConfigure = Boolean(process.env.CRON_SECRET);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-ink">Intégrations</h1>
        <p className="mt-0.5 max-w-3xl text-xs text-ink-muted">
          Les leads arrivent par Slack, les formulaires Webflow, Make ou les e-mails de notification.
          La saisie manuelle et l’import CSV restent possibles. Notion se synchronise en arrière-plan.
        </p>
      </header>

      <PanneauNotion etat={etat} />

      <Carte>
        <EnteteCarte
          titre="Slack — canal #inbound"
          sousTitre="Chaque message posté dans le canal devient un lead, classé automatiquement"
          action={<Badge ton={slackConfigure ? 'bon' : 'neutre'}>{slackConfigure ? 'Signature active' : 'Non configuré'}</Badge>}
        />
        <div className="space-y-3 px-5 pb-5 text-xs text-ink-2">
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              Créez une application Slack, activez <strong className="text-ink">Event Subscriptions</strong> et
              abonnez-vous à <code className="rounded bg-surface-2 px-1">message.channels</code> (ou{' '}
              <code className="rounded bg-surface-2 px-1">message.groups</code> pour un canal privé).
            </li>
            <li>Renseignez l’URL de réception ci-dessous. Slack vérifie l’URL puis envoie les messages.</li>
            <li>
              Copiez le <strong className="text-ink">Signing Secret</strong> dans{' '}
              <code className="rounded bg-surface-2 px-1">SLACK_SIGNING_SECRET</code> : chaque requête est
              vérifiée, une requête non signée est rejetée.
            </li>
            <li>Invitez l’application dans le canal #inbound.</li>
          </ol>
          <BlocCode label="URL de réception des événements" contenu={`${base}/api/ingest/slack`} />
          <p>
            Les messages sont classés automatiquement (segment, type de demande, initiative). En dessous
            de 60 % de confiance, le lead est marqué « à vérifier » plutôt que scoré sur une supposition.
          </p>
        </div>
      </Carte>

      <Carte>
        <EnteteCarte
          titre="Formulaires Webflow"
          sousTitre="Chaque soumission crée un lead sans passer par un e-mail"
          action={
            <Badge ton={webflowConfigure ? 'bon' : 'attention'}>
              {webflowConfigure ? 'Signature active' : 'Signature à configurer'}
            </Badge>
          }
        />
        <div className="space-y-3 px-5 pb-5 text-xs text-ink-2">
          <p>
            Créez un webhook « Form submission » sur le site Webflow et renseignez cette URL.
            Ajoutez sa clé de signature dans <code className="rounded bg-surface-2 px-1">WEBFLOW_WEBHOOK_SECRET</code>.
          </p>
          <BlocCode label="URL du webhook" contenu={`${base}/api/ingest/webflow`} />
          <p>
            Le nom du formulaire sert de lead magnet. Les champs « Nom et Prénom », « Commune »,
            « Mail » et « Téléphone » des formulaires AirFit sont reconnus.
          </p>
        </div>
      </Carte>

      <Carte>
        <EnteteCarte
          titre="Make — qualification et envoi"
          sousTitre="Make enrichit le lead ; le dashboard calcule les points"
          action={
            <Badge ton={ingestionConfiguree ? 'bon' : 'attention'}>
              {ingestionConfiguree ? 'Jeton actif' : 'INGEST_TOKEN manquant'}
            </Badge>
          }
        />
        <div className="space-y-3 px-5 pb-5 text-xs text-ink-2">
          <p>
            Dans Make, ajoutez un module HTTP POST avec l’en-tête
            <code className="rounded bg-surface-2 px-1">Authorization: Bearer INGEST_TOKEN</code>.
            Envoyez les faits connus ; le dashboard complète les dimensions manquantes et applique la règle de points.
          </p>
          <BlocCode
            label="Endpoint et exemple JSON"
            contenu={`POST ${base}/api/ingest/formulaire
Content-Type: application/json
Authorization: Bearer VOTRE_INGEST_TOKEN

{"email":"marie@example.fr","nom":"Marie Dupont","societe":"Mairie de Lyon","segment":"Collectivité","relation":"Prospect","typeDemande":"Catalogue","initiative":"Newsletter"}`}
          />
        </div>
      </Carte>

      <Carte>
        <EnteteCarte
          titre="E-mails de formulaire"
          sousTitre="Pour les notifications de formulaire reçues par mail"
          action={
            <Badge ton={ingestionConfiguree ? 'bon' : 'attention'}>
              {ingestionConfiguree ? 'Jeton actif' : 'INGEST_TOKEN manquant'}
            </Badge>
          }
        />
        <div className="space-y-3 px-5 pb-5 text-xs text-ink-2">
          <p>
            Branchez un automatisme (Make, Zapier, n8n, règle Gmail) qui relaie chaque e-mail de
            formulaire vers cet endpoint. Il accepte un e-mail ou un lot de 50.
          </p>
          <BlocCode
            label="Exemple d’appel"
            contenu={`curl -X POST ${base}/api/ingest/email \\
  -H "Authorization: Bearer $INGEST_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sujet": "Nouvelle demande depuis le site",
    "expediteur": "Marie Dupont <m.dupont@mairie-lyon.fr>",
    "corpsTexte": "Nom : Marie Dupont\\nSociété : Mairie de Lyon\\nMessage : demande de devis",
    "url": "https://exemple.fr/contact?utm_source=newsletter"
  }'`}
          />
          <p>
            Sans <code className="rounded bg-surface-2 px-1">INGEST_TOKEN</code>, l’endpoint est fermé :
            un endpoint public polluerait les objectifs.
          </p>
        </div>
      </Carte>

      <div className="grid gap-4 lg:grid-cols-2">
        <Carte>
          <EnteteCarte
            titre="Synchronisation automatique Notion"
            sousTitre="Chaque jour à 05:00 UTC sur Vercel, après le déploiement"
            action={<Badge ton={cronConfigure ? 'bon' : 'attention'}>{cronConfigure ? 'Secret actif' : 'CRON_SECRET manquant'}</Badge>}
          />
          <div className="space-y-2 px-5 pb-5 text-xs text-ink-2">
            <p>Pour une fréquence plus élevée, programmez un appel depuis Make avec le secret de tâche planifiée.</p>
            <BlocCode label="Route à appeler" contenu={`${base}/api/cron/notion-sync`} />
          </div>
        </Carte>

        <Carte>
          <EnteteCarte titre="Import & export CSV" sousTitre="Reprise d’historique et partage ponctuel" />
          <div className="space-y-2 px-5 pb-5 text-xs text-ink-2">
            <p>
              L’import se fait depuis la page Leads (bouton « Importer »). Les en-têtes sont reconnus en
              clair, les valeurs acceptent les libellés comme les clés techniques, et les doublons du
              même jour sont ignorés.
            </p>
            <BlocCode label="Export filtré (mêmes filtres que la liste)" contenu={`${base}/api/export?periode=2026-Q4`} />
          </div>
        </Carte>

        <Carte>
          <EnteteCarte titre="Variables d’environnement" sousTitre="À renseigner dans .env.local ou dans Vercel" />
          <div className="px-5 pb-5">
            <BlocCode
              contenu={`NOTION_TOKEN=ntn_…
NOTION_DATABASE_ID=…        # ou NOTION_PARENT_PAGE_ID pour créer la base
SLACK_SIGNING_SECRET=…
WEBFLOW_WEBHOOK_SECRET=…
INGEST_TOKEN=…              # jeton de votre choix
CRON_SECRET=…               # jeton distinct pour la synchronisation
API_KEY=…                   # accès des outils tiers à l'API
DATABASE_URL=…              # base PostgreSQL/Supabase en production
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…
DASHBOARD_ALLOWED_EMAILS=… # adresses exactes autorisées
APP_URL=${base}`}
            />
          </div>
        </Carte>
      </div>
    </div>
  );
}
