// Agents de projet : types et logique pure (voir backend/app/chat/src/agents.py pour les règles).
//
// Un agent est un RÔLE défini par les membres d'un projet (consignes, outils autorisés, modèle par défaut). Il ne donne
// jamais un droit : il ne peut que retirer des outils à ce que l'utilisateur a déjà. Ici, uniquement ce qui se teste sans
// navigateur : conversion formulaire <-> API, cases à cocher des outils, relecture avant le premier emploi.

import { EFFORTS, type Effort } from "./models";

export type AgentOut = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  instructions: string;
  /** null = aucune restriction propre à l'agent (tous les outils de l'utilisateur). */
  tools: string[] | null;
  model: string | null;
  effort: string | null;
  icon: string | null;
  starters: string[];
  archived: boolean;
  version: number;
  created_by: string;
  created_by_email: string | null;
  created_at: string;
  updated_by: string;
  updated_by_email: string | null;
  updated_at: string;
  can_edit: boolean;
};

export type AgentVersionOut = {
  version: number;
  name: string;
  instructions: string;
  tools: string[] | null;
  model: string | null;
  effort: string | null;
  created_by: string;
  created_by_email: string | null;
  created_at: string;
};

export type Risk = "read" | "write" | "outbound";

export type AgentToolGroup = { id: string; label: string; description: string; risk: Risk; tools: string[] };

export type AgentTemplate = {
  id: string;
  icon: string;
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  starters: string[];
};

export type AgentLimits = {
  name_max: number;
  description_max: number;
  instructions_max: number;
  starters_max: number;
  starter_max: number;
  agents_max: number;
};

export type AgentCatalog = { templates: AgentTemplate[]; tool_groups: AgentToolGroup[]; limits: AgentLimits };

export const agentsUrl = (projectId: string, path = "") => `/api/donna/chat/projects/${encodeURIComponent(projectId)}/agents${path}`;
export const agentCatalogUrl = (lang: string) => `/api/donna/chat/agents/catalog?lang=${encodeURIComponent(lang)}`;

// ── Formulaire ───────────────────────────────────────────────────────────────

/** Ce que l'éditeur manipule. `restrict` faux = « tous les outils » (l'API reçoit tools: null). */
export type AgentDraft = {
  name: string;
  description: string;
  icon: string | null;
  instructions: string;
  restrict: boolean;
  tools: string[];
  model: string | null;
  effort: Effort | null;
  starters: string[];
};

export const emptyDraft = (): AgentDraft => ({
  name: "",
  description: "",
  icon: null,
  instructions: "",
  restrict: false,
  tools: [],
  model: null,
  effort: null,
  starters: [],
});

const asEffort = (value: string | null): Effort | null => (EFFORTS as readonly string[]).includes(value ?? "") ? (value as Effort) : null;

export const draftFromAgent = (agent: AgentOut): AgentDraft => ({
  name: agent.name,
  description: agent.description ?? "",
  icon: agent.icon,
  instructions: agent.instructions,
  restrict: agent.tools !== null,
  tools: agent.tools ?? [],
  model: agent.model,
  effort: asEffort(agent.effort),
  starters: [...agent.starters],
});

export const draftFromTemplate = (template: AgentTemplate): AgentDraft => ({
  name: template.name,
  description: template.description,
  icon: template.icon,
  instructions: template.instructions,
  restrict: true,
  tools: [...template.tools],
  model: null,
  effort: null,
  starters: [...template.starters],
});

/** Une ancienne version rechargée dans le formulaire (rien n'est enregistré avant « Enregistrer » : une nouvelle version naît). */
export const draftFromVersion = (base: AgentDraft, version: AgentVersionOut): AgentDraft => ({
  ...base,
  name: version.name,
  instructions: version.instructions,
  restrict: version.tools !== null,
  tools: version.tools ?? [],
  model: version.model,
  effort: asEffort(version.effort),
});

const uniqueSorted = (names: string[]) => [...new Set(names)].sort();

/** Corps envoyé à l'API : valeurs nettoyées, effort sans modèle abandonné, phrases vides retirées. */
export function draftPayload(draft: AgentDraft, limits?: AgentLimits) {
  const starters = draft.starters.map((s) => s.trim()).filter(Boolean).slice(0, limits?.starters_max ?? 4);
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    instructions: draft.instructions.trim(),
    tools: draft.restrict ? uniqueSorted(draft.tools) : null,
    model: draft.model,
    effort: draft.model ? draft.effort : null,
    icon: draft.icon,
    starters,
  };
}

export type DraftProblem = "name" | "nameLength" | "instructions" | "instructionsLength" | "descriptionLength" | "starterLength";

export function draftProblems(draft: AgentDraft, limits: AgentLimits): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const payload = draftPayload(draft, limits);
  if (!payload.name) problems.push("name");
  else if (payload.name.length > limits.name_max) problems.push("nameLength");
  if (!payload.instructions) problems.push("instructions");
  else if (payload.instructions.length > limits.instructions_max) problems.push("instructionsLength");
  if ((payload.description ?? "").length > limits.description_max) problems.push("descriptionLength");
  if (payload.starters.some((s) => s.length > limits.starter_max)) problems.push("starterLength");
  return problems;
}

/** Le brouillon diffère-t-il de l'agent enregistré ? (sert à désactiver « Enregistrer » et à prévenir avant d'abandonner) */
export function isDirty(draft: AgentDraft, agent: AgentOut): boolean {
  return JSON.stringify(draftPayload(draft)) !== JSON.stringify(draftPayload(draftFromAgent(agent)));
}

/** Nom d'une copie : « Auditeur (copie) », tronqué pour tenir dans la limite sans couper le suffixe. */
export function copyName(name: string, suffix: string, max: number): string {
  const tail = ` (${suffix})`;
  return name.trim().slice(0, Math.max(1, max - tail.length)).trimEnd() + tail;
}

// ── Outils ───────────────────────────────────────────────────────────────────

export const toggleTool = (selected: string[], tool: string): string[] =>
  selected.includes(tool) ? selected.filter((t) => t !== tool) : [...selected, tool];

export const setGroup = (selected: string[], group: AgentToolGroup, on: boolean): string[] =>
  on ? uniqueSorted([...selected, ...group.tools]) : selected.filter((t) => !group.tools.includes(t));

export const groupState = (selected: string[], group: AgentToolGroup): "all" | "some" | "none" => {
  const count = group.tools.filter((t) => selected.includes(t)).length;
  return count === 0 ? "none" : count === group.tools.length ? "all" : "some";
};

const RISK_ORDER: Record<Risk, number> = { read: 0, write: 1, outbound: 2 };

/** Ce que l'agent peut au plus provoquer : « tout » (aucune restriction), « rien », ou le risque le plus fort de ses outils. */
export type ToolsSummary = { kind: "all" } | { kind: "none" } | { kind: "some"; count: number; risk: Risk };

export function toolsSummary(tools: string[] | null, groups: AgentToolGroup[]): ToolsSummary {
  if (tools === null) return { kind: "all" };
  if (tools.length === 0) return { kind: "none" };
  let risk: Risk = "read";
  for (const group of groups) {
    if (group.tools.some((t) => tools.includes(t)) && RISK_ORDER[group.risk] > RISK_ORDER[risk]) risk = group.risk;
  }
  return { kind: "some", count: tools.length, risk };
}

// ── Relecture avant le premier emploi ────────────────────────────────────────
//
// Les consignes d'un agent sont écrites par un membre du projet et lues par le modèle pour les autres : avant d'utiliser un
// agent (ou une nouvelle version de celui-ci), l'utilisateur les voit et confirme. Mémorisé par navigateur — un garde-fou de
// confort et de transparence, pas un contrôle d'accès (le serveur, lui, applique les règles à chaque message).

export const AGENT_SEEN_KEY = "donna.agents-seen";

export type SeenMap = Record<string, number>;

export function parseSeen(raw: string | null): SeenMap {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === "number" && Number.isFinite(v))) as SeenMap;
  } catch {
    return {};
  }
}

export function readSeen(): SeenMap {
  try {
    return parseSeen(window.localStorage.getItem(AGENT_SEEN_KEY));
  } catch {
    return {}; // stockage indisponible : on redemande la relecture, jamais l'inverse
  }
}

export function markSeen(agent: Pick<AgentOut, "id" | "version">): void {
  try {
    window.localStorage.setItem(AGENT_SEEN_KEY, JSON.stringify({ ...readSeen(), [agent.id]: agent.version }));
  } catch {
    // Sans stockage, la relecture sera redemandée au prochain emploi.
  }
}

/** Vrai tant que l'utilisateur n'a pas vu CETTE version de l'agent (jamais utilisé, ou consignes modifiées depuis). */
export const needsReview = (agent: Pick<AgentOut, "id" | "version">, seen: SeenMap): boolean => seen[agent.id] !== agent.version;
