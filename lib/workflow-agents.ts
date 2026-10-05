// Étapes de workflow qui prennent le rôle d'un agent de projet FIGÉ à une version (backend/app/workflows/src/definition.py::AgentRef).
//
// L'utilisateur approuve {agent, version} : l'écran d'approbation et la page des automatisations montrent donc QUEL agent, QUELLE
// version, si une version plus récente existe (le workflow ne la suit pas tout seul) et si l'agent est encore utilisable. Ici, ce qui
// se teste sans navigateur : extraction des références, appel de résolution, état à afficher.

import type { AgentVersionOut } from "./agents";

export type AgentRefIn = { id: string; version: number };

/** GET /app/chat/agents/resolve — `accessible: false` : rien d'autre n'est dit (on ne révèle pas l'existence d'un agent). */
export type ResolvedAgentRef = {
  id: string;
  version: number;
  accessible: boolean;
  name: string | null;
  project_id: string | null;
  project_name: string | null;
  current_version: number | null;
  archived: boolean;
  version_exists: boolean;
};

export type RefState = "ok" | "newer" | "archived" | "missing" | "hidden";

const MAX_REFS = 10;

const isRef = (value: unknown): value is AgentRefIn => {
  if (typeof value !== "object" || value === null) return false;
  const { id, version } = value as Record<string, unknown>;
  return typeof id === "string" && id.length > 0 && id.length <= 36 && typeof version === "number" && Number.isInteger(version) && version >= 1;
};

/** Références d'agent d'une définition de workflow (sans doublon, 10 au plus) ; tolérant : une définition inattendue n'en a aucune. */
export function agentRefsOf(definition: unknown): AgentRefIn[] {
  const steps = typeof definition === "object" && definition !== null ? (definition as { steps?: unknown }).steps : null;
  if (!Array.isArray(steps)) return [];
  const seen = new Set<string>();
  const refs: AgentRefIn[] = [];
  for (const step of steps) {
    const ref = typeof step === "object" && step !== null ? (step as { agent_ref?: unknown }).agent_ref : null;
    if (!isRef(ref)) continue;
    const key = `${ref.id}:${ref.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ id: ref.id, version: ref.version });
    if (refs.length === MAX_REFS) break;
  }
  return refs;
}

export const resolveUrl = (refs: AgentRefIn[]): string =>
  `/api/donna/chat/agents/resolve?${refs.map((ref) => `ref=${encodeURIComponent(`${ref.id}:${ref.version}`)}`).join("&")}`;

export const versionsUrl = (projectId: string, agentId: string): string =>
  `/api/donna/chat/projects/${encodeURIComponent(projectId)}/agents/${encodeURIComponent(agentId)}/versions`;

/** Ce que l'écran doit dire de cette référence, du plus grave au plus bénin. */
export function refState(ref: ResolvedAgentRef): RefState {
  if (!ref.accessible) return "hidden";
  if (!ref.version_exists) return "missing";
  if (ref.archived) return "archived";
  if (ref.current_version !== null && ref.current_version > ref.version) return "newer";
  return "ok";
}

/** Un état qui fera échouer l'étape à l'exécution (agent archivé, inaccessible, version absente). */
export const blocksTheStep = (state: RefState): boolean => state === "hidden" || state === "missing" || state === "archived";

export const pickVersion = (versions: AgentVersionOut[], version: number): AgentVersionOut | null =>
  versions.find((candidate) => candidate.version === version) ?? null;
