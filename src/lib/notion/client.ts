/** Client Notion paresseux : l'app démarre et fonctionne sans Notion configuré. */
import { Client } from '@notionhq/client';

let instance: Client | null = null;

export class NotionNonConfigure extends Error {
  constructor() {
    super(
      "Notion n'est pas configuré : renseignez NOTION_TOKEN (et NOTION_DATABASE_ID ou NOTION_PARENT_PAGE_ID) dans .env.local.",
    );
    this.name = 'NotionNonConfigure';
  }
}

export function notionEstConfigure(): boolean {
  return Boolean(process.env.NOTION_TOKEN);
}

export function getNotion(): Client {
  if (!notionEstConfigure()) throw new NotionNonConfigure();
  if (!instance) {
    instance = new Client({ auth: process.env.NOTION_TOKEN, notionVersion: '2025-09-03' });
  }
  return instance;
}

/** Réinitialise le client (changement de token à chaud, tests). */
export function reinitialiserNotion(): void {
  instance = null;
}
