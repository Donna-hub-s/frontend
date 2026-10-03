import { describe, expect, it } from "vitest";
import {
  copyName,
  draftFromAgent,
  draftFromTemplate,
  draftFromVersion,
  draftPayload,
  draftProblems,
  emptyDraft,
  groupState,
  isDirty,
  needsReview,
  parseSeen,
  setGroup,
  toggleTool,
  toolsSummary,
  type AgentLimits,
  type AgentOut,
  type AgentToolGroup,
  type AgentVersionOut,
} from "./agents";

const limits: AgentLimits = { name_max: 20, description_max: 40, instructions_max: 100, starters_max: 2, starter_max: 10, agents_max: 30 };

const agent: AgentOut = {
  id: "a1",
  project_id: "p1",
  name: "Auditeur",
  description: null,
  instructions: "Sois rigoureux.",
  tools: ["inspect_table", "ask_user"],
  model: "fast",
  effort: "high",
  icon: "chart",
  starters: ["Analyse"],
  archived: false,
  version: 3,
  created_by: "u1",
  created_by_email: null,
  created_at: "2026-01-01T00:00:00",
  updated_by: "u2",
  updated_by_email: null,
  updated_at: "2026-01-02T00:00:00",
  can_edit: true,
};

const groups: AgentToolGroup[] = [
  { id: "documents", label: "Documents", description: "", risk: "read", tools: ["search_documents", "read_document"] },
  { id: "email", label: "E-mail", description: "", risk: "outbound", tools: ["propose_email", "search_emails"] },
  { id: "files", label: "Fichiers", description: "", risk: "write", tools: ["create_document"] },
];

describe("brouillon <-> API", () => {
  it("un agent sans liste d'outils se rouvre « tous les outils », et l'envoie comme null", () => {
    const open = draftFromAgent({ ...agent, tools: null });
    expect(open.restrict).toBe(false);
    expect(draftPayload(open).tools).toBeNull();
    expect(draftPayload({ ...open, tools: ["ask_user"] }).tools).toBeNull(); // des cases cochées avant de « tout » rouvrir ne fuient pas
  });

  it("une liste vide est une vraie restriction (aucun outil), pas « tous »", () => {
    const none = draftFromAgent({ ...agent, tools: [] });
    expect(none.restrict).toBe(true);
    expect(draftPayload(none).tools).toEqual([]);
  });

  it("nettoie les valeurs : espaces, phrases vides, doublons d'outils, effort sans modèle", () => {
    const payload = draftPayload({
      ...emptyDraft(),
      name: "  Relecteur ",
      description: "   ",
      instructions: " Relis. ",
      restrict: true,
      tools: ["b", "a", "b"],
      model: null,
      effort: "high",
      starters: [" un ", "", "deux", "trois"],
    });
    expect(payload).toEqual({
      name: "Relecteur",
      description: null,
      instructions: "Relis.",
      tools: ["a", "b"],
      model: null,
      effort: null,
      icon: null,
      starters: ["un", "deux", "trois"],
    });
    expect(draftPayload({ ...emptyDraft(), starters: ["a", "b", "c"] }, limits).starters).toEqual(["a", "b"]); // plafond du serveur
    expect(draftPayload({ ...emptyDraft(), model: "fast", effort: "low" }).effort).toBe("low");
  });

  it("un modèle prêt à copier s'ouvre restreint à ses outils", () => {
    const draft = draftFromTemplate({ id: "t", icon: "target", name: "Relecteur", description: "d", instructions: "i", tools: ["ask_user"], starters: ["s"] });
    expect(draft).toMatchObject({ name: "Relecteur", restrict: true, tools: ["ask_user"], icon: "target", model: null });
  });

  it("recharger une ancienne version ne touche ni la description ni l'icône ni les phrases", () => {
    const old: AgentVersionOut = {
      version: 1, name: "Ancien nom", instructions: "Ancienne consigne", tools: null, model: null, effort: null, created_by: "u1", created_by_email: null, created_at: "",
    };
    const draft = draftFromVersion(draftFromAgent(agent), old);
    expect(draft).toMatchObject({ name: "Ancien nom", instructions: "Ancienne consigne", restrict: false, model: null, icon: "chart", starters: ["Analyse"] });
  });

  it("isDirty ignore ce que l'API normalise", () => {
    const draft = draftFromAgent(agent);
    expect(isDirty(draft, agent)).toBe(false);
    expect(isDirty({ ...draft, name: " Auditeur " }, agent)).toBe(false);
    expect(isDirty({ ...draft, tools: ["ask_user", "inspect_table"] }, agent)).toBe(false); // ordre
    expect(isDirty({ ...draft, instructions: "Autre." }, agent)).toBe(true);
    expect(isDirty({ ...draft, restrict: false }, agent)).toBe(true);
  });
});

describe("draftProblems", () => {
  const ok = { ...emptyDraft(), name: "Nom", instructions: "Consigne" };

  it("exige un nom et des consignes, dans les limites du serveur", () => {
    expect(draftProblems(ok, limits)).toEqual([]);
    expect(draftProblems({ ...ok, name: "  " }, limits)).toEqual(["name"]);
    expect(draftProblems({ ...ok, instructions: "" }, limits)).toEqual(["instructions"]);
    expect(draftProblems({ ...ok, name: "x".repeat(21) }, limits)).toEqual(["nameLength"]);
    expect(draftProblems({ ...ok, instructions: "x".repeat(101) }, limits)).toEqual(["instructionsLength"]);
    expect(draftProblems({ ...ok, description: "x".repeat(41) }, limits)).toEqual(["descriptionLength"]);
    expect(draftProblems({ ...ok, starters: ["x".repeat(11)] }, limits)).toEqual(["starterLength"]);
  });

  it("mesure après nettoyage : des espaces autour ne font pas dépasser", () => {
    expect(draftProblems({ ...ok, instructions: `  ${"x".repeat(100)}  ` }, limits)).toEqual([]);
  });
});

describe("outils", () => {
  it("coche et décoche un outil, un groupe entier, et dit l'état du groupe", () => {
    expect(toggleTool(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleTool(["a", "b"], "a")).toEqual(["b"]);
    expect(groupState([], groups[0])).toBe("none");
    expect(groupState(["search_documents"], groups[0])).toBe("some");
    expect(groupState(["search_documents", "read_document"], groups[0])).toBe("all");
    expect(setGroup(["x"], groups[0], true)).toEqual(["read_document", "search_documents", "x"]);
    expect(setGroup(["x", "search_documents"], groups[0], false)).toEqual(["x"]);
  });

  it("résume ce que l'agent peut au plus provoquer", () => {
    expect(toolsSummary(null, groups)).toEqual({ kind: "all" });
    expect(toolsSummary([], groups)).toEqual({ kind: "none" });
    expect(toolsSummary(["search_documents"], groups)).toEqual({ kind: "some", count: 1, risk: "read" });
    expect(toolsSummary(["search_documents", "create_document"], groups)).toEqual({ kind: "some", count: 2, risk: "write" });
    expect(toolsSummary(["create_document", "propose_email"], groups)).toEqual({ kind: "some", count: 2, risk: "outbound" });
    expect(toolsSummary(["outil_inconnu"], groups)).toEqual({ kind: "some", count: 1, risk: "read" });
  });
});

describe("copyName", () => {
  it("ajoute le suffixe et tient dans la limite en gardant le suffixe", () => {
    expect(copyName("Auditeur", "copie", 80)).toBe("Auditeur (copie)");
    const long = copyName("x".repeat(80), "copie", 80);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith(" (copie)")).toBe(true);
  });
});

describe("relecture avant le premier emploi", () => {
  it("demande la relecture d'un agent jamais vu et d'une version nouvelle, pas d'une version déjà vue", () => {
    expect(needsReview(agent, {})).toBe(true);
    expect(needsReview(agent, { a1: 3 })).toBe(false);
    expect(needsReview(agent, { a1: 2 })).toBe(true); // les consignes ont changé depuis
    expect(needsReview(agent, { autre: 3 })).toBe(true);
  });

  it("lit prudemment le stockage : une valeur illisible redemande la relecture, jamais l'inverse", () => {
    expect(parseSeen(null)).toEqual({});
    expect(parseSeen("{pas du json")).toEqual({});
    expect(parseSeen("[1,2]")).toEqual({});
    expect(parseSeen('"texte"')).toEqual({});
    expect(parseSeen('{"a1": 3, "a2": "3", "a3": null}')).toEqual({ a1: 3 });
  });
});
