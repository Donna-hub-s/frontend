import { describe, expect, it } from "vitest";
import type { AgentVersionOut } from "./agents";
import { agentRefsOf, blocksTheStep, pickVersion, refState, resolveUrl, versionsUrl, type ResolvedAgentRef } from "./workflow-agents";

const resolved = (patch: Partial<ResolvedAgentRef> = {}): ResolvedAgentRef => ({
  id: "a1", version: 2, accessible: true, name: "Auditeur", project_id: "p1", project_name: "Audit", current_version: 2, archived: false, version_exists: true, ...patch,
});

describe("agentRefsOf", () => {
  it("lit les références des étapes agent, sans doublon, dans l'ordre", () => {
    const definition = {
      trigger: { type: "manual" },
      steps: [
        { id: "a", type: "agent", agent_ref: { id: "x", version: 2 } },
        { id: "b", type: "notify" },
        { id: "c", type: "agent", agent_ref: { id: "x", version: 2 } },
        { id: "d", type: "agent", agent_ref: { id: "x", version: 3 } },
        { id: "e", type: "agent", agent_ref: { id: "y", version: 1 } },
      ],
    };
    expect(agentRefsOf(definition)).toEqual([{ id: "x", version: 2 }, { id: "x", version: 3 }, { id: "y", version: 1 }]);
  });

  it("ignore tout ce qui n'est pas une référence valide, sans lever", () => {
    for (const definition of [null, undefined, 3, "x", {}, { steps: "oups" }, { steps: [null, 3, "x", {}, { agent_ref: null }, { agent_ref: "a:1" }] }]) {
      expect(agentRefsOf(definition)).toEqual([]);
    }
    const bad = [{ id: "", version: 1 }, { id: "a", version: 0 }, { id: "a", version: 1.5 }, { id: "a", version: "1" }, { id: 5, version: 1 }, { id: "x".repeat(37), version: 1 }, { version: 1 }, { id: "a" }];
    expect(agentRefsOf({ steps: bad.map((agent_ref) => ({ agent_ref })) })).toEqual([]);
  });

  it("plafonne à 10 références", () => {
    const steps = Array.from({ length: 15 }, (_, i) => ({ agent_ref: { id: `a${i}`, version: 1 } }));
    expect(agentRefsOf({ steps })).toHaveLength(10);
  });
});

describe("urls", () => {
  it("encode les références dans la requête de résolution", () => {
    expect(resolveUrl([{ id: "a b", version: 2 }, { id: "c", version: 1 }])).toBe("/api/donna/chat/agents/resolve?ref=a%20b%3A2&ref=c%3A1");
    expect(versionsUrl("p/1", "a?")).toBe("/api/donna/chat/projects/p%2F1/agents/a%3F/versions");
  });
});

describe("refState", () => {
  it("dit la vérité la plus grave d'abord", () => {
    expect(refState(resolved())).toBe("ok");
    expect(refState(resolved({ current_version: 3 }))).toBe("newer");
    expect(refState(resolved({ archived: true, current_version: 3 }))).toBe("archived");
    expect(refState(resolved({ version_exists: false, archived: true }))).toBe("missing");
    expect(refState(resolved({ accessible: false, name: null, version_exists: true, archived: true }))).toBe("hidden");
    expect(refState(resolved({ current_version: null }))).toBe("ok");
  });

  it("sait quels états feront échouer l'étape", () => {
    expect(["ok", "newer"].map((s) => blocksTheStep(s as never))).toEqual([false, false]);
    expect(["archived", "missing", "hidden"].map((s) => blocksTheStep(s as never))).toEqual([true, true, true]);
  });
});

describe("pickVersion", () => {
  const versions = [3, 2, 1].map((version) => ({ version, name: `v${version}`, instructions: `consignes ${version}` }) as AgentVersionOut);
  it("trouve la version figée, jamais la plus récente par défaut", () => {
    expect(pickVersion(versions, 2)?.instructions).toBe("consignes 2");
    expect(pickVersion(versions, 9)).toBeNull();
    expect(pickVersion([], 1)).toBeNull();
  });
});
