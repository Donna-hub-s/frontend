import type { ContextStatusOut } from "./workspace-types";

export type ContextTone = "ok" | "warn" | "high";

/** Couleur de la jauge : le budget se remplit, la compaction devient utile puis urgente. */
export const contextTone = (pct: number): ContextTone => (pct >= 85 ? "high" : pct >= 60 ? "warn" : "ok");

export type CompactOutcome = "compacted" | "nothing";

/** Le serveur répond sans erreur même s'il n'y avait rien à compacter : on compare l'état avant/après. */
export const compactOutcome = (before: ContextStatusOut | null, after: ContextStatusOut): CompactOutcome =>
  after.covered_messages > (before?.covered_messages ?? 0) ? "compacted" : "nothing";

export const clampPct = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
