import { describe, expect, it } from "vitest";
import { parseChoice, serializeChoice, resolveChoice, requestFields, selectModel, groupByTier, estimatedCost, formatCost, type ModelChoice } from "@/lib/models";
import type { ModelOut } from "@/lib/workspace-types";

describe("models lib helper functions", () => {
  const sampleModels: ModelOut[] = [
    {
      id: "fast-model",
      model: "fast-model",
      provider: "openrouter",
      label: "Fast Model",
      tier: "eco",
      recommended: true,
      reasoning: false,
      vision: true,
      price_in: 0.15,
      price_out: 0.6,
      context: 128000,
    },
    {
      id: "reasoning-model",
      model: "reasoning-model",
      provider: "openrouter",
      label: "Reasoning Model",
      tier: "premium",
      recommended: false,
      reasoning: true,
      vision: false,
      price_in: 2.5,
      price_out: 10.0,
      context: 128000,
    },
  ];

  it("parseChoice / serializeChoice serialize et deserialize correctement", () => {
    const choice: ModelChoice = { id: "fast-model", effort: "medium" };
    const serialized = serializeChoice(choice);
    expect(serialized).toBe(JSON.stringify(choice));
    expect(parseChoice(serialized)).toEqual(choice);
  });

  it("parseChoice refuse des chaînes mal formées ou des id invalides", () => {
    expect(parseChoice("invalid json")).toBeNull();
    expect(parseChoice(JSON.stringify({ id: "../invalid" }))).toBeNull();
    expect(parseChoice(null)).toBeNull();
  });

  it("resolveChoice résout le modèle et réinitialise l'effort s'il ne gère pas le raisonnement", () => {
    const choice: ModelChoice = { id: "fast-model", effort: "high" };
    const resolved = resolveChoice(choice, sampleModels);
    expect(resolved).toEqual({
      model: sampleModels[0],
      effort: null, // fast-model n'est pas "reasoning"
    });
  });

  it("requestFields génère les champs de requête adéquats", () => {
    expect(requestFields(null)).toEqual({});
    expect(requestFields({ id: "fast-model", effort: null })).toEqual({ model: "fast-model" });
    expect(requestFields({ id: "reasoning-model", effort: "high" })).toEqual({
      model: "reasoning-model",
      effort: "high",
    });
  });

  it("selectModel sélectionne un modèle et conserve/adapte l'effort", () => {
    const current: ModelChoice = { id: "reasoning-model", effort: "high" };
    // Sélection d'un modèle sans raisonnement => effort est null
    expect(selectModel(current, sampleModels[0])).toEqual({
      id: "fast-model",
      effort: null,
    });
    // Sélection d'un modèle avec raisonnement => conserve l'effort
    expect(selectModel(current, sampleModels[1])).toEqual({
      id: "reasoning-model",
      effort: "high",
    });
  });

  it("groupByTier groupe les modèles par tier", () => {
    const groups = groupByTier(sampleModels);
    expect(groups).toHaveLength(2);
    expect(groups[0].tier).toBe("eco");
    expect(groups[1].tier).toBe("premium");
  });

  it("estimatedCost et formatCost calculent et formatent correctement les coûts", () => {
    const cost = estimatedCost(sampleModels[0]);
    expect(cost).toBeGreaterThan(0);
    expect(typeof formatCost(cost!, "fr")).toBe("string");
  });
});
