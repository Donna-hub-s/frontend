/**
 * Activité récente : ce que DONNA a fait SANS qu'on le lui demande dans le fil — une automatisation qui a tourné cette
 * nuit, une recherche approfondie terminée pendant qu'on était ailleurs.
 *
 * Ces arrivées n'avaient qu'un toast, qui disparaît (reminder-toasts.tsx) : une fois fermé, rien ne disait plus qu'elles
 * avaient eu lieu. Ici elles viennent du SERVEUR (`GET /app/workflows/runs`, `GET /app/chat/research`), donc survivent
 * au rechargement et à l'appareil.
 *
 * Isolé de l'affichage pour la même raison que lib/home.ts : un tri à l'envers ou une fenêtre mal posée donne une liste
 * plausible mais fausse (une exécution de l'an dernier présentée comme « récente »).
 */

import { parseBackendDate } from "./workspace-types";

/** Une exécution (`GET /app/workflows/runs`, backend workflows/schemas.py::RecentRunOut). */
export type WorkflowRunSummary = {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  trigger: string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  conversation_id: string | null;
};

/** Une recherche approfondie (`GET /app/chat/research`, backend chat/schemas.py::ResearchSummaryOut). */
export type ResearchSummary = {
  id: string;
  conversation_id: string;
  question: string;
  status: string;
  pages_read: number;
  pages_failed: number;
  cost_usd: number | null;
  report_message_id: string | null;
  created_at: string;
  finished_at: string | null;
};

/** États montrés à l'utilisateur. Les deux sources n'ont pas les mêmes mots (succeeded / done) : on les ramène ici à un seul. */
export type ActivityState = "running" | "done" | "failed" | "skipped" | "cancelled" | "interrupted";

export type ActivityItem = {
  /** Unique entre les deux sources (un identifiant de run et un de recherche pourraient se ressembler). */
  key: string;
  kind: "workflow" | "research";
  title: string;
  state: ActivityState;
  startedAt: number;
  /** Fin du travail, null tant qu'il tourne. */
  endedAt: number | null;
  /** Instant qui range la liste : la fin si elle existe, sinon le début. */
  at: number;
  /** Conversation où retrouver le résultat ; null pour une automatisation qui n'en a pas encore (voir la page Workflows). */
  conversationId: string | null;
};

/** Au-delà, ce n'est plus de l'activité « récente » mais un historique — il vit sur la page Workflows et dans les conversations. */
export const WINDOW_MS = 7 * 24 * 3_600_000;
export const MAX_ACTIVITY = 5;
/** Relecture du serveur tant qu'au moins un travail tourne : la ligne passe d'« en cours » à « terminé » sans rechargement. */
export const POLL_MS = 15_000;
/** Un travail « en cours » commencé il y a plus longtemps n'est plus relu : c'est une ligne restée bloquée, pas un travail vivant. */
export const LIVE_MS = 6 * 3_600_000;

const WORKFLOW_STATES: Record<string, ActivityState> = { running: "running", succeeded: "done", failed: "failed", skipped: "skipped" };
const RESEARCH_STATES: Record<string, ActivityState> = {
  running: "running",
  done: "done",
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "interrupted",
};

/** Un statut que le client ne connaît pas (le serveur a pu en ajouter un) est traité comme « non lancé » : neutre, jamais « réussi ». */
const WORKFLOW_FALLBACK: ActivityState = "skipped";
const RESEARCH_FALLBACK: ActivityState = "interrupted";

function item(
  kind: ActivityItem["kind"],
  id: string,
  title: string,
  state: ActivityState,
  started: string,
  finished: string | null,
  conversationId: string | null,
): ActivityItem | null {
  const startedAt = parseBackendDate(started);
  if (startedAt === null) return null; // une ligne sans date exploitable ne peut ni être rangée ni être jugée récente
  // Une fin ne se lit que sur un travail terminé : un « en cours » qui porterait une date de fin serait incohérent.
  const endedAt = state === "running" ? null : parseBackendDate(finished);
  return { key: `${kind}:${id}`, kind, title, state, startedAt, endedAt, at: endedAt ?? startedAt, conversationId };
}

/**
 * Les travaux récents des deux sources, du plus frais au plus ancien : fenêtre de `WINDOW_MS`, au plus `max` lignes.
 * `now` est passé, jamais lu ici : le résultat dépend de l'heure, et un test ne doit pas dépendre de l'horloge.
 */
export function recentActivity(
  workflows: readonly WorkflowRunSummary[],
  research: readonly ResearchSummary[],
  now: number,
  max: number = MAX_ACTIVITY,
): ActivityItem[] {
  const all = [
    ...workflows.map((run) =>
      item("workflow", run.id, run.workflow_name, WORKFLOW_STATES[run.status] ?? WORKFLOW_FALLBACK, run.started_at, run.finished_at, run.conversation_id),
    ),
    ...research.map((run) =>
      item("research", run.id, run.question, RESEARCH_STATES[run.status] ?? RESEARCH_FALLBACK, run.created_at, run.finished_at, run.conversation_id),
    ),
  ];
  return all
    .filter((entry): entry is ActivityItem => entry !== null && now - entry.at <= WINDOW_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, max);
}

/** Un travail tourne VRAIMENT encore (commencé il y a moins de `LIVE_MS`) : c'est ce qui justifie de relire le serveur. */
export function hasLiveWork(items: readonly ActivityItem[], now: number): boolean {
  return items.some((entry) => entry.state === "running" && now - entry.startedAt <= LIVE_MS);
}
