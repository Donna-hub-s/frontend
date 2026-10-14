// Plafonds de la mémoire d'un projet — voir backend/app/chat/src/quotas.py (niveaux, ordre, ce que chaque plafond borne) et
// routes/quota_routes.py. Le serveur décide de tout (plafonds supérieurs, droits) ; ici, de quoi présenter l'usage et saisir des valeurs.

export const QUOTA_KEYS = ["facts_max", "fact_chars_max", "memory_prompt_chars_max", "model_writes_per_day"] as const;
export type QuotaKey = (typeof QUOTA_KEYS)[number];

export type QuotaLevels = { env: number | null; tenant: number | null; project: number | null; effective: number | null };
export type QuotaUsage = { facts: number; chars: number; model_writes_today: number };
export type ProjectQuotas = { limits: Record<QuotaKey, QuotaLevels>; usage: QuotaUsage; can_set: boolean };
export type WorkspaceQuotas = { limits: Record<QuotaKey, { env: number | null; tenant: number | null }>; can_set: boolean };

/** Part utilisée d'un plafond, de 0 à 100 (arrondie) ; 0 quand il n'y a pas de plafond. */
export const percent = (used: number, limit: number | null): number => (limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);

/** Ce qu'un niveau inférieur ne peut pas dépasser : le plus petit des niveaux supérieurs qui ont posé une valeur (null : aucun plafond). */
export function ceiling(levels: { env: number | null; tenant: number | null }): number | null {
  const present = [levels.env, levels.tenant].filter((v): v is number => v !== null);
  return present.length ? Math.min(...present) : null;
}

export type ParsedInput = { kind: "inherit" } | { kind: "value"; value: number } | { kind: "invalid" };

/** Saisie d'un plafond : vide = retour à l'héritage ; sinon un entier strictement positif (le serveur contrôle les bornes). */
export function parseInput(text: string): ParsedInput {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "inherit" };
  if (!/^\d+$/.test(trimmed)) return { kind: "invalid" };
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 1 ? { kind: "value", value } : { kind: "invalid" };
}

export const projectQuotasUrl = (projectId: string) => `/api/donna/chat/projects/${encodeURIComponent(projectId)}/memory/quotas`;
export const WORKSPACE_QUOTAS_URL = "/api/donna/chat/workspace/quotas";

async function request<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export const fetchProjectQuotas = (projectId: string) => request<ProjectQuotas>(projectQuotasUrl(projectId));
export const fetchWorkspaceQuotas = () => request<WorkspaceQuotas>(WORKSPACE_QUOTAS_URL);
export const putProjectQuotas = (projectId: string, limits: Partial<Record<QuotaKey, number | null>>) =>
  request<ProjectQuotas>(projectQuotasUrl(projectId), { method: "PUT", body: JSON.stringify({ limits }) });
export const putWorkspaceQuotas = (limits: Partial<Record<QuotaKey, number | null>>) =>
  request<WorkspaceQuotas>(WORKSPACE_QUOTAS_URL, { method: "PUT", body: JSON.stringify({ limits }) });
