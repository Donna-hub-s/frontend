// Fenêtre de contexte d'un projet, élément par élément — voir backend/app/chat/src/context_breakdown.py et
// routes/context_routes.py. Le serveur calcule tout (il lit les mêmes données que le vrai message) ; ici, de quoi
// le demander, découper la barre et présenter les rubriques. Les tailles sont des ESTIMATIONS (1 jeton ≈ 4 caractères).

import type { ModelChoice } from "./models";
import type { ModelOut } from "./workspace-types";

export type ContextKind = "system" | "tools" | "mcp" | "project" | "memory" | "files" | "history" | "user" | "rag" | string;

export type ContextItem = {
  id: string;
  label: string;
  tokens: number;
  chars: number;
  /** Faux : pas chargé dans la fenêtre (outil non offert, fait trop ancien…) — montré pour savoir pourquoi. */
  active: boolean;
  note: string | null;
  text: string | null;
};

export type ContextSection = {
  id: string;
  label: string;
  kind: ContextKind;
  /** Ce qu'elle pèse dans la fenêtre de DONNA maintenant. */
  tokens: number;
  /** Ce qu'elle pèserait si elle était chargée (outils non offerts, extraits possibles, outils d'un sous-agent) — jamais additionné. */
  potential_tokens: number;
  chars: number;
  /** Faux : hors de la fenêtre de DONNA (sous-agents) ou variable (extraits des documents). */
  counted: boolean;
  /** Dépend de la question posée. */
  variable: boolean;
  items: ContextItem[];
  note: string | null;
  text: string | null;
  /** Le texte existe mais n'est montré qu'au responsable de l'espace. */
  text_hidden: boolean;
  truncated: boolean;
};

export type ContextBreakdown = {
  project_id: string;
  conversation_id: string | null;
  agent: string | null;
  model: { id: string; label: string; context: number | null } | null;
  window: number | null;
  used_tokens: number;
  percent: number | null;
  estimator: string;
  sections: ContextSection[];
};

export type ContextQuery = { conversationId?: string | null; agentId?: string | null; model?: string | null };

export function contextUrl(projectId: string, query: ContextQuery = {}): string {
  const params = new URLSearchParams();
  if (query.conversationId) params.set("conversation_id", query.conversationId);
  if (query.agentId) params.set("agent_id", query.agentId);
  if (query.model) params.set("model", query.model);
  const suffix = params.toString();
  return `/api/donna/chat/projects/${encodeURIComponent(projectId)}/context${suffix ? `?${suffix}` : ""}`;
}

export type ContextResult = { ok: true; data: ContextBreakdown } | { ok: false; status: number };

/** Lecture seule côté serveur : aucun modèle appelé, aucune recherche. Un échec réseau vaut le statut 0. */
export async function fetchContextBreakdown(projectId: string, query: ContextQuery = {}): Promise<ContextResult> {
  try {
    const response = await fetch(contextUrl(projectId, query), { cache: "no-store" });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, data: (await response.json()) as ContextBreakdown };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Couleur du segment de la barre, par nature de rubrique (la légende et les rangées disent les mêmes choses en toutes lettres). */
export const KIND_TONE: Record<string, string> = {
  system: "bg-ink-3",
  tools: "bg-brand-fill",
  mcp: "bg-brand-fill/40",
  project: "bg-bordeaux-500",
  memory: "bg-rose-300",
  files: "bg-success",
  history: "bg-attention",
  user: "bg-ink-2",
  rag: "bg-rose-300/50",
};
export const toneOf = (kind: ContextKind): string => KIND_TONE[kind] ?? "bg-ink-3";

export type BarSegment = { id: string; kind: ContextKind; tokens: number; pct: number };

/**
 * Segments de la barre : seules les rubriques qui pèsent vraiment dans la fenêtre de DONNA. Avec une fenêtre connue, la barre est à
 * l'échelle de la fenêtre (le reste est vide) ; sans, elle est à l'échelle du total. Jamais plus de 100 % : un contexte déjà au-delà de
 * la fenêtre remplit la barre, la valeur exacte reste dans les chiffres.
 */
export function barSegments(sections: ContextSection[], window: number | null): BarSegment[] {
  const counted = sections.filter((s) => s.counted && s.tokens > 0);
  const total = counted.reduce((sum, s) => sum + s.tokens, 0);
  const scale = window && window > 0 ? Math.max(window, total) : total;
  if (scale <= 0) return [];
  return counted.map((s) => ({ id: s.id, kind: s.kind, tokens: s.tokens, pct: (s.tokens * 100) / scale }));
}

/** Part d'un poids dans une base, en pourcentage lisible : « < 1 » plutôt que 0 pour ce qui pèse quelque chose. */
export function shareLabel(tokens: number, base: number | null): string | null {
  if (!base || base <= 0) return null;
  const pct = (tokens * 100) / base;
  if (tokens > 0 && pct < 1) return "< 1";
  return pct >= 10 ? String(Math.round(pct)) : (Math.round(pct * 10) / 10).toString().replace(/\.0$/, "");
}

export const formatTokens = (value: number, lang: string): string => new Intl.NumberFormat(lang).format(Math.round(value));

/** Les outils MCP sont libellés « sous-agent · outil » par le serveur : on les regroupe par sous-agent. */
export function groupBySubagent(items: ContextItem[]): { agent: string; items: ContextItem[]; tokens: number }[] {
  const groups = new Map<string, ContextItem[]>();
  for (const item of items) {
    const [agent, ...rest] = item.label.split(" · ");
    const key = rest.length ? agent : "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([agent, group]) => ({ agent, items: group, tokens: group.reduce((sum, i) => sum + i.tokens, 0) }));
}

/** Modèles qui annoncent une fenêtre : sans elle, pas de pourcentage à montrer. */
export const modelsWithWindow = (models: ModelOut[] | null | undefined): ModelOut[] =>
  (models ?? []).filter((m) => typeof m.context === "number" && m.context > 0);

/** Modèle proposé d'office : celui que l'utilisateur a choisi dans le composeur, s'il est servi par ce serveur et annonce une fenêtre. */
export function defaultModelId(choice: ModelChoice | null, models: ModelOut[] | null | undefined): string | null {
  if (!choice) return null;
  return modelsWithWindow(models).some((m) => m.id === choice.id) ? choice.id : null;
}

/** Rubriques dont un poids « possible » (non compté) mérite d'être montré à côté de leur zéro. */
export const hasPotential = (section: ContextSection): boolean => !section.counted || section.potential_tokens > 0;

/** Le poids qu'une rubrique affiche : celui de la fenêtre si elle compte, sinon ce qu'elle pèserait ailleurs ou au maximum. */
export const shownWeight = (section: ContextSection): number => (section.counted ? section.tokens : section.potential_tokens);
