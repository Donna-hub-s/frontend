import type { WorkflowOut, WorkflowRunOut } from "./workspace-types";

/** Un workflow jamais approuvé (ou modifié depuis) ne tourne pas seul : il attend l'approbation de l'utilisateur. */
export const needsApproval = (workflow: Pick<WorkflowOut, "status" | "approved">): boolean =>
  workflow.status === "draft" || !workflow.approved;

export const isFinished = (run: Pick<WorkflowRunOut, "status">): boolean => run.status !== "running";

/** Le dernier run d'une liste (le serveur les renvoie du plus récent au plus ancien). */
export const latestRun = (runs: WorkflowRunOut[] | undefined): WorkflowRunOut | null => runs?.[0] ?? null;

/** Décompte des étapes d'un run, pour la ligne de résumé de l'historique. */
export function tally(run: Pick<WorkflowRunOut, "steps">): { ok: number; skipped: number; failed: number } {
  const count = { ok: 0, skipped: 0, failed: 0 };
  for (const step of run.steps) {
    if (step.status === "succeeded") count.ok += 1;
    else if (step.status === "skipped") count.skipped += 1;
    else count.failed += 1;
  }
  return count;
}

/** Heure HH:MM valide (00:00 à 23:59), comme côté serveur. */
export const isValidTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export type BriefingChannel = "app" | "whatsapp" | "email";

/** Corps de POST /app/workflows/from-template pour le briefing du matin. */
export function briefingRequest(options: { at: string; timezone: string; every: "weekdays" | "day" | "week"; channels: BriefingChannel[] }) {
  return { template: "morning_briefing" as const, at: options.at, timezone: options.timezone, every: options.every, channels: options.channels };
}

/** Arguments d'un appel d'outil, lisibles : une valeur multi-ligne (le code d'un script) s'affiche telle quelle, avec
 * ses vrais retours à la ligne, et non échappée en « \\n » comme le ferait un JSON.stringify. */
export function formatToolArguments(args: unknown): string {
  if (args === null || args === undefined) return "";
  if (typeof args === "string") return args;
  if (typeof args !== "object" || Array.isArray(args)) return JSON.stringify(args);
  return Object.entries(args as Record<string, unknown>)
    .map(([key, value]) => {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      return text.includes("\n") ? `${key}:\n${text}` : `${key}: ${text}`;
    })
    .join("\n");
}
