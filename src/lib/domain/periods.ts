/** Utilitaires de périodes (trimestres) — tout est calculé en heure locale Europe/Paris. */

export interface Periode {
  /** Identifiant canonique, ex. `2026-Q4`. */
  id: string;
  annee: number;
  trimestre: 1 | 2 | 3 | 4;
  /** Date de début incluse, au format `YYYY-MM-DD`. */
  debut: string;
  /** Date de fin incluse, au format `YYYY-MM-DD`. */
  fin: string;
  label: string;
}

const RE_PERIODE = /^(\d{4})-Q([1-4])$/;

export function estIdPeriodeValide(id: string): boolean {
  return RE_PERIODE.test(id);
}

/** `2026-10-14` → `2026-Q4`. Accepte une date ISO complète ou une date simple. */
export function periodeDepuisDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) throw new Error(`Date invalide : ${String(date)}`);
  const trimestre = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${trimestre}`;
}

export function construirePeriode(id: string): Periode {
  const m = RE_PERIODE.exec(id);
  if (!m) throw new Error(`Période invalide : ${id} (attendu \`YYYY-Q[1-4]\`)`);
  const annee = Number(m[1]);
  const trimestre = Number(m[2]) as 1 | 2 | 3 | 4;
  const moisDebut = (trimestre - 1) * 3;
  const debut = new Date(Date.UTC(annee, moisDebut, 1));
  const fin = new Date(Date.UTC(annee, moisDebut + 3, 0));
  return {
    id,
    annee,
    trimestre,
    debut: debut.toISOString().slice(0, 10),
    fin: fin.toISOString().slice(0, 10),
    label: `T${trimestre} ${annee}`,
  };
}

/** Liste de périodes autour d'une période donnée (pour le sélecteur de l'UI). */
export function periodesAutour(id: string, avant = 4, apres = 2): Periode[] {
  const ref = construirePeriode(id);
  const index = ref.annee * 4 + (ref.trimestre - 1);
  const out: Periode[] = [];
  for (let i = index - avant; i <= index + apres; i++) {
    const annee = Math.floor(i / 4);
    const trimestre = (i % 4) + 1;
    out.push(construirePeriode(`${annee}-Q${trimestre}`));
  }
  return out;
}

/** Progression temporelle dans la période, entre 0 et 1 (pour l'objectif « au rythme actuel »). */
export function avancementPeriode(id: string, maintenant: Date = new Date()): number {
  const p = construirePeriode(id);
  const debut = Date.parse(`${p.debut}T00:00:00Z`);
  const fin = Date.parse(`${p.fin}T23:59:59Z`);
  const t = maintenant.getTime();
  if (t <= debut) return 0;
  if (t >= fin) return 1;
  return (t - debut) / (fin - debut);
}

/** Nombre de jours restants dans la période (0 si terminée). */
export function joursRestants(id: string, maintenant: Date = new Date()): number {
  const p = construirePeriode(id);
  const fin = Date.parse(`${p.fin}T23:59:59Z`);
  const restant = Math.ceil((fin - maintenant.getTime()) / 86_400_000);
  return Math.max(0, restant);
}
