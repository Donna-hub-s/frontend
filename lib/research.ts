// Recherche approfondie : proposée par DONNA (carte d'approbation avec estimation), lancée par l'accord de l'utilisateur, suivie
// ici pendant qu'elle travaille en tâche de fond (voir backend/app/chat/src/research.py et routes/research_routes.py).

export type ResearchStep = { at: string; kind: "search" | "read" | "failed" | string; label: string };

export type ResearchRun = {
  id: string;
  conversation_id: string;
  question: string;
  depth: string;
  status: "running" | "done" | "failed" | "cancelled" | "interrupted" | string;
  estimate_usd: number | null;
  cap_usd: number;
  cost_usd: number | null;
  pages_read: number;
  pages_failed: number;
  steps: ResearchStep[];
  report_message_id: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

/** Ce que l'utilisateur approuve (PendingActionOut.research). */
export type ResearchDraft = { question: string; depth: string; lines: string[]; cost_usd: number | null; cap_usd: number; model: string | null };

export const researchByActionUrl = (actionId: string) => `/api/donna/chat/research/by-action/${encodeURIComponent(actionId)}`;
export const researchCancelUrl = (runId: string) => `/api/donna/chat/research/${encodeURIComponent(runId)}/cancel`;

export const POLL_MS = 3000;

/** Terminée, quelle que soit l'issue : plus rien à suivre. */
export const isFinished = (status: string): boolean => status !== "running";

/** Montant en dollars (les coûts sont stockés ainsi) : « ≈ 0,12 $ », ou « < 0,01 $ » plutôt qu'un zéro qui ferait croire à la gratuité. */
export function formatUsd(value: number, locale: string): string {
  const format = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return value > 0 && value < 0.005 ? `< ${format(0.01)}` : format(value);
}

/** Coût estimé d'une recherche proposée : null = tarif inconnu (affiché comme tel, jamais un chiffre inventé) ; 0 = modèle local. */
export function estimateText(cost: number | null, labels: { unknown: string; free: string }, locale: string): string {
  if (cost === null) return labels.unknown;
  if (cost === 0) return labels.free;
  return `≈ ${formatUsd(cost, locale)}`;
}

/** Dernières étapes à montrer (les plus récentes en bas), sans doublon consécutif. */
export function visibleSteps(steps: ResearchStep[], max = 6): ResearchStep[] {
  const out: ResearchStep[] = [];
  for (const step of steps) if (out[out.length - 1]?.label !== step.label) out.push(step);
  return out.slice(-max);
}

/** Un `GET .../research/...` : la recherche, ou null (pas encore démarrée, refusée, panne réseau) — l'appelant réessaie. */
export async function fetchRun(actionId: string): Promise<ResearchRun | null> {
  try {
    const response = await fetch(researchByActionUrl(actionId), { cache: "no-store" });
    return response.ok ? ((await response.json()) as ResearchRun) : null;
  } catch {
    return null;
  }
}

export async function cancelRun(runId: string): Promise<boolean> {
  try {
    return (await fetch(researchCancelUrl(runId), { method: "POST" })).ok;
  } catch {
    return false;
  }
}
