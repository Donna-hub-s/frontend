import { describe, expect, it, vi } from "vitest";
import {
  barSegments,
  contextUrl,
  defaultModelId,
  fetchContextBreakdown,
  groupBySubagent,
  modelsWithWindow,
  shareLabel,
  shownWeight,
  toneOf,
  type ContextItem,
  type ContextSection,
} from "./context-window";
import type { ModelOut } from "./workspace-types";

const section = (over: Partial<ContextSection>): ContextSection => ({
  id: "s",
  label: "S",
  kind: "system",
  tokens: 0,
  potential_tokens: 0,
  chars: 0,
  counted: true,
  variable: false,
  items: [],
  note: null,
  text: null,
  text_hidden: false,
  truncated: false,
  ...over,
});
const item = (label: string, tokens: number): ContextItem => ({ id: label, label, tokens, chars: 0, active: true, note: null, text: null });
const model = (id: string, context: number | null): ModelOut => ({
  id,
  tier: "eco",
  label: id,
  provider: "p",
  model: id,
  price_in: null,
  price_out: null,
  context,
  reasoning: false,
  vision: false,
  recommended: false,
});

describe("contextUrl", () => {
  it("n'ajoute que ce qui est demandé, encodé", () => {
    expect(contextUrl("p 1")).toBe("/api/donna/chat/projects/p%201/context");
    expect(contextUrl("p1", { conversationId: "c1", agentId: "", model: "gpt-x" })).toBe("/api/donna/chat/projects/p1/context?conversation_id=c1&model=gpt-x");
    expect(contextUrl("p1", { agentId: "a/b" })).toContain("agent_id=a%2Fb");
  });
});

describe("barSegments", () => {
  const sections = [
    section({ id: "a", kind: "tools", tokens: 600 }),
    section({ id: "b", kind: "memory", tokens: 400 }),
    section({ id: "mcp", kind: "mcp", tokens: 0, potential_tokens: 900, counted: false }),
    section({ id: "rag", kind: "rag", tokens: 0, potential_tokens: 2000, counted: false, variable: true }),
    section({ id: "empty", kind: "user", tokens: 0 }),
  ];

  it("est à l'échelle de la fenêtre quand elle est connue, sans les rubriques qui ne pèsent pas", () => {
    expect(barSegments(sections, 10_000)).toEqual([
      { id: "a", kind: "tools", tokens: 600, pct: 6 },
      { id: "b", kind: "memory", tokens: 400, pct: 4 },
    ]);
  });

  it("est à l'échelle du total sans fenêtre : la barre est pleine", () => {
    expect(barSegments(sections, null).reduce((sum, s) => sum + s.pct, 0)).toBeCloseTo(100);
  });

  it("ne dépasse jamais 100 % quand le contexte dépasse la fenêtre", () => {
    expect(barSegments(sections, 500).reduce((sum, s) => sum + s.pct, 0)).toBeCloseTo(100);
  });

  it("n'a aucun segment quand rien ne pèse", () => {
    expect(barSegments([section({ tokens: 0 })], 1000)).toEqual([]);
  });
});

describe("shareLabel", () => {
  it("arrondit proprement et dit « < 1 » pour ce qui pèse peu mais pas rien", () => {
    expect(shareLabel(50, 10_000)).toBe("< 1");
    expect(shareLabel(0, 10_000)).toBe("0");
    expect(shareLabel(150, 10_000)).toBe("1.5");
    expect(shareLabel(1_000, 10_000)).toBe("10");
    expect(shareLabel(3_333, 10_000)).toBe("33");
  });

  it("n'invente rien sans base", () => {
    expect(shareLabel(100, null)).toBeNull();
    expect(shareLabel(100, 0)).toBeNull();
  });
});

describe("groupBySubagent", () => {
  it("regroupe les outils MCP par sous-agent et totalise chaque groupe", () => {
    const groups = groupBySubagent([item("analyste · a", 10), item("redacteur · b", 20), item("analyste · c", 5)]);
    expect(groups.map((g) => [g.agent, g.tokens, g.items.length])).toEqual([
      ["analyste", 15, 2],
      ["redacteur", 20, 1],
    ]);
  });

  it("garde un libellé sans sous-agent dans un groupe sans nom", () => {
    expect(groupBySubagent([item("seul", 3)])[0].agent).toBe("");
  });
});

describe("modèles", () => {
  const models = [model("a", 128_000), model("b", null), model("c", 0)];

  it("ne propose que ceux qui annoncent une fenêtre", () => {
    expect(modelsWithWindow(models).map((m) => m.id)).toEqual(["a"]);
    expect(modelsWithWindow(null)).toEqual([]);
  });

  it("reprend le modèle du composeur seulement s'il est servi et annonce une fenêtre", () => {
    expect(defaultModelId({ id: "a", effort: null }, models)).toBe("a");
    expect(defaultModelId({ id: "b", effort: null }, models)).toBeNull();
    expect(defaultModelId({ id: "zz", effort: null }, models)).toBeNull();
    expect(defaultModelId(null, models)).toBeNull();
  });
});

describe("poids montré", () => {
  it("le poids dans la fenêtre pour ce qui compte, le possible pour le reste", () => {
    expect(shownWeight(section({ tokens: 120, potential_tokens: 999 }))).toBe(120);
    expect(shownWeight(section({ tokens: 0, potential_tokens: 900, counted: false }))).toBe(900);
  });

  it("donne une couleur même à une nature inconnue", () => {
    expect(toneOf("tools")).toBe("bg-brand-fill");
    expect(toneOf("inconnue")).toBe("bg-ink-3");
  });
});

describe("fetchContextBreakdown", () => {
  it("rend le détail, le statut d'un refus, ou 0 quand le réseau tombe", async () => {
    const ok = { project_id: "p1", sections: [], used_tokens: 3 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(ok))).mockResolvedValueOnce(new Response("{}", { status: 404 })).mockRejectedValueOnce(new Error("x")));
    expect(await fetchContextBreakdown("p1")).toEqual({ ok: true, data: ok });
    expect(await fetchContextBreakdown("p1")).toEqual({ ok: false, status: 404 });
    expect(await fetchContextBreakdown("p1")).toEqual({ ok: false, status: 0 });
    vi.unstubAllGlobals();
  });
});
