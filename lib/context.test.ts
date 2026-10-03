import { describe, expect, it } from "vitest";
import { clampPct, compactOutcome, contextTone } from "./context";
import type { ContextStatusOut } from "./workspace-types";

const status = (covered: number, pct = 10): ContextStatusOut => ({
  total_messages: 20, covered_messages: covered, recent_messages: 20 - covered, summary_chars: covered * 40,
  context_budget_used_pct: pct, compacted: covered > 0,
});

describe("contextTone", () => {
  it("passe de ok à warn à 60 % puis high à 85 %", () => {
    expect([0, 59].map(contextTone)).toEqual(["ok", "ok"]);
    expect([60, 84].map(contextTone)).toEqual(["warn", "warn"]);
    expect([85, 100].map(contextTone)).toEqual(["high", "high"]);
  });
});

describe("compactOutcome", () => {
  it("reconnaît une vraie compaction : plus de messages condensés qu'avant", () => {
    expect(compactOutcome(status(0), status(12))).toBe("compacted");
    expect(compactOutcome(status(6), status(14))).toBe("compacted");
    expect(compactOutcome(null, status(8))).toBe("compacted");
  });

  it("répond « rien à compacter » quand l'état n'a pas bougé (conversation trop courte)", () => {
    expect(compactOutcome(status(0), status(0))).toBe("nothing");
    expect(compactOutcome(status(8), status(8))).toBe("nothing");
    expect(compactOutcome(null, status(0))).toBe("nothing");
  });
});

describe("clampPct", () => {
  it("borne et arrondit", () => {
    expect([-5, 42.4, 99.6, 140].map(clampPct)).toEqual([0, 42, 100, 100]);
  });
});
