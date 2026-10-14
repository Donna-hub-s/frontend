import { describe, expect, it } from "vitest";
import { isAllowed, isPolicy, POLICIES, stricter } from "./memory-policy";

describe("niveaux d'écriture de la mémoire", () => {
  it("vont du plus ouvert au plus strict", () => {
    expect(POLICIES).toEqual(["editors", "approval", "owners"]);
  });

  it("n'offrent que des choix au moins aussi stricts que le plancher de l'espace", () => {
    expect(POLICIES.filter((p) => isAllowed(p, "editors"))).toEqual(["editors", "approval", "owners"]);
    expect(POLICIES.filter((p) => isAllowed(p, "approval"))).toEqual(["approval", "owners"]);
    expect(POLICIES.filter((p) => isAllowed(p, "owners"))).toEqual(["owners"]);
  });

  it("un plancher illisible ferme tout sauf le plus strict (échec fermé)", () => {
    expect(POLICIES.filter((p) => isAllowed(p, "n'importe quoi"))).toEqual(["owners"]);
  });

  it("la valeur appliquée est la plus stricte des deux", () => {
    expect(stricter("editors", "approval")).toBe("approval");
    expect(stricter("owners", "approval")).toBe("owners");
    expect(stricter("editors", "editors")).toBe("editors");
    expect(stricter("editors", "?")).toBe("owners");
  });

  it("reconnaît les valeurs valides", () => {
    expect(isPolicy("approval")).toBe(true);
    expect(isPolicy("admin")).toBe(false);
    expect(isPolicy(undefined)).toBe(false);
  });
});
