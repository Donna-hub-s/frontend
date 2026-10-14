import { describe, expect, it } from "vitest";
import { ceiling, parseInput, percent } from "./memory-quotas";

describe("plafonds de la mémoire", () => {
  it("calcule la part utilisée, bornée à 100 %, et 0 sans plafond", () => {
    expect(percent(38_000, 40_000)).toBe(95);
    expect(percent(142, 200)).toBe(71);
    expect(percent(500, 200)).toBe(100);
    expect(percent(5, null)).toBe(0);
    expect(percent(5, 0)).toBe(0);
  });

  it("le plafond d'un niveau inférieur est le plus petit des niveaux supérieurs qui ont posé une valeur", () => {
    expect(ceiling({ env: 200, tenant: 100 })).toBe(100);
    expect(ceiling({ env: 200, tenant: null })).toBe(200);
    expect(ceiling({ env: null, tenant: 50 })).toBe(50);
    expect(ceiling({ env: null, tenant: null })).toBeNull();
  });

  it("lit la saisie : vide = héritage, entier positif = valeur, le reste est refusé", () => {
    expect(parseInput("")).toEqual({ kind: "inherit" });
    expect(parseInput("   ")).toEqual({ kind: "inherit" });
    expect(parseInput(" 120 ")).toEqual({ kind: "value", value: 120 });
    for (const bad of ["0", "-5", "1.5", "dix", "1e3", "12 000", "99999999999999999999"]) expect(parseInput(bad)).toEqual({ kind: "invalid" });
  });
});
