import { describe, expect, it } from "vitest";
import { estimatedCost, formatCost, groupByTier, parseChoice, requestFields, resolveChoice, selectModel, serializeChoice } from "./models";
import type { ModelOut } from "./workspace-types";

const model = (over: Partial<ModelOut>): ModelOut => ({
  id: "a", tier: "eco", label: "A", provider: "openrouter", model: "v/a", price_in: 0.037, price_out: 0.17, context: 131072,
  reasoning: true, vision: false, recommended: false, ...over,
});

describe("parseChoice", () => {
  it("relit un choix valide, avec ou sans effort", () => {
    expect(parseChoice('{"id":"or-gpt-5-mini","effort":"high"}')).toEqual({ id: "or-gpt-5-mini", effort: "high" });
    expect(parseChoice('{"id":"or-gpt-5-mini"}')).toEqual({ id: "or-gpt-5-mini", effort: null });
  });

  it("ignore tout ce qui n'a pas la bonne forme", () => {
    for (const raw of [null, "", "pas du json", "{}", '{"id":42}', '{"id":"Bad Id"}', '{"id":"../etc"}', '{"id":""}']) expect(parseChoice(raw)).toBeNull();
  });

  it("ne garde pas un effort inconnu", () => {
    expect(parseChoice('{"id":"a","effort":"extreme"}')).toEqual({ id: "a", effort: null });
  });

  it("fait l'aller-retour", () => {
    const choice = { id: "a", effort: "low" as const };
    expect(parseChoice(serializeChoice(choice))).toEqual(choice);
    expect(serializeChoice(null)).toBeNull();
  });
});

describe("resolveChoice", () => {
  const models = [model({ id: "think", reasoning: true }), model({ id: "plain", reasoning: false })];

  it("exige que le modèle existe encore dans la liste du serveur", () => {
    expect(resolveChoice({ id: "gone", effort: null }, models)).toBeNull();
    expect(resolveChoice(null, models)).toBeNull();
    expect(resolveChoice({ id: "think", effort: null }, null)).toBeNull();
  });

  it("ne garde l'effort que pour un modèle qui raisonne", () => {
    expect(resolveChoice({ id: "think", effort: "high" }, models)?.effort).toBe("high");
    expect(resolveChoice({ id: "plain", effort: "high" }, models)?.effort).toBeNull();
  });
});

describe("requestFields", () => {
  it("n'ajoute rien sans choix : le serveur garde son modèle par défaut", () => {
    expect(requestFields(null)).toEqual({});
  });

  it("envoie l'identifiant, et l'effort seulement s'il est choisi", () => {
    expect(requestFields({ id: "a", effort: null })).toEqual({ model: "a" });
    expect(requestFields({ id: "a", effort: "medium" })).toEqual({ model: "a", effort: "medium" });
  });
});

describe("selectModel", () => {
  it("garde l'effort quand le nouveau modèle raisonne, l'abandonne sinon", () => {
    const current = { id: "x", effort: "high" as const };
    expect(selectModel(current, model({ id: "b", reasoning: true }))).toEqual({ id: "b", effort: "high" });
    expect(selectModel(current, model({ id: "c", reasoning: false }))).toEqual({ id: "c", effort: null });
    expect(selectModel(null, model({ id: "d" }))).toEqual({ id: "d", effort: null });
  });
});

describe("groupByTier", () => {
  it("range dans l'ordre économique, équilibré, premium, gratuit et omet les niveaux vides", () => {
    const groups = groupByTier([model({ id: "1", tier: "premium" }), model({ id: "2", tier: "eco" }), model({ id: "3", tier: "free" }), model({ id: "4", tier: "eco" })]);
    expect(groups.map((g) => [g.tier, g.models.map((m) => m.id)])).toEqual([["eco", ["2", "4"]], ["premium", ["1"]], ["free", ["3"]]]);
  });
});

describe("estimatedCost", () => {
  it("estime un message type (5 000 tokens en entrée, 500 en sortie)", () => {
    expect(estimatedCost({ price_in: 0.037, price_out: 0.17 })).toBeCloseTo(0.00027, 5);
    expect(estimatedCost({ price_in: 2, price_out: 10 })).toBeCloseTo(0.015, 6);
  });

  it("renvoie null quand le tarif est inconnu", () => {
    expect(estimatedCost({ price_in: null, price_out: null })).toBeNull();
    expect(estimatedCost({ price_in: 1, price_out: null })).toBeNull();
  });

  it("formate sans notation scientifique", () => {
    expect(formatCost(0.00027, "en")).toBe("0.00027");
    expect(formatCost(0.015, "fr")).toBe("0,015");
  });
});
