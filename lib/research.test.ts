import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelRun, estimateText, fetchRun, formatUsd, isFinished, researchByActionUrl, researchCancelUrl, visibleSteps } from "./research";

afterEach(() => vi.unstubAllGlobals());

describe("estimateText", () => {
  const labels = { unknown: "coût inconnu", free: "gratuit" };
  it("n'invente jamais un chiffre : inconnu reste inconnu, local est gratuit", () => {
    expect(estimateText(null, labels, "fr")).toBe("coût inconnu");
    expect(estimateText(0, labels, "fr")).toBe("gratuit");
    expect(estimateText(0.1234, labels, "en")).toBe("≈ $0.12");
  });
});

describe("formatUsd", () => {
  it("un montant minuscule ne s'écrit pas 0,00 $ (ce qui ferait croire à de la gratuité)", () => {
    expect(formatUsd(0.001, "en")).toBe("< $0.01");
    expect(formatUsd(0, "en")).toBe("$0.00");
    expect(formatUsd(0.5, "en")).toBe("$0.50");
  });
});

describe("visibleSteps", () => {
  const step = (label: string) => ({ at: "t", kind: "search", label });
  it("garde les plus récentes et retire les doublons consécutifs", () => {
    const steps = ["a", "a", "b", "c", "d", "e", "f", "g", "h"].map(step);
    expect(visibleSteps(steps, 3).map((s) => s.label)).toEqual(["f", "g", "h"]);
    expect(visibleSteps(["x", "x", "y", "x"].map(step)).map((s) => s.label)).toEqual(["x", "y", "x"]);
    expect(visibleSteps([])).toEqual([]);
  });
});

describe("suivi", () => {
  it("une recherche est terminée dès qu'elle n'est plus en cours, quelle que soit l'issue", () => {
    expect(isFinished("running")).toBe(false);
    for (const status of ["done", "failed", "cancelled", "interrupted"]) expect(isFinished(status)).toBe(true);
  });

  it("encode les identifiants dans les URL", () => {
    expect(researchByActionUrl("a/b")).toBe("/api/donna/chat/research/by-action/a%2Fb");
    expect(researchCancelUrl("r 1")).toBe("/api/donna/chat/research/r%201/cancel");
  });

  it("fetchRun et cancelRun ne lèvent jamais : null/false sur un refus ou une panne", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchRun("a1")).toBeNull();
    expect(await cancelRun("r1")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("réseau")));
    expect(await fetchRun("a1")).toBeNull();
    expect(await cancelRun("r1")).toBe(false);
    const run = { id: "r1", status: "running" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => run }));
    expect(await fetchRun("a1")).toEqual(run);
    expect(await cancelRun("r1")).toBe(true);
  });
});
