'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { clientAuthServeur } from '@/lib/auth/server';
import { emailAutorise } from '@/lib/auth/config';
import { confirmerPointsLeads, supprimerLeads } from '@/lib/db/leads';

const schemaIds = z.array(z.string().trim().min(1).max(100)).min(1).max(50);

async function emailUtilisateur(): Promise<string> {
  const auth = await clientAuthServeur();
  const { data, error } = await auth.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (error || !emailAutorise(email)) throw new Error('Connexion personnelle requise.');
  return email!;
}

function revaliderLeads(): void {
  revalidatePath('/');
  revalidatePath('/leads');
}

export async function confirmerSelectionLeads(idsBruts: string[]): Promise<{ modifies: number }> {
  const ids = [...new Set(schemaIds.parse(idsBruts))];
  const email = await emailUtilisateur();
  const modifies = await confirmerPointsLeads(ids, email);
  revaliderLeads();
  return { modifies };
}

export async function supprimerSelectionLeads(idsBruts: string[]): Promise<{ modifies: number }> {
  const ids = [...new Set(schemaIds.parse(idsBruts))];
  await emailUtilisateur();
  const modifies = await supprimerLeads(ids);
  revaliderLeads();
  return { modifies };
}
