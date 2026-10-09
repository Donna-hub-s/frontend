import { describe, expect, it } from "vitest";
import { formatElapsed, MIN_VISIBLE_MS, visibleElapsed, type ElapsedUnits } from "./elapsed";

const U: ElapsedUnits = { second: "s", minute: "min", hour: "h" };
const s = (n: number) => n * 1_000;
const min = (n: number) => n * 60_000;
const h = (n: number) => n * 3_600_000;

describe("mise en forme d'une durée", () => {
  it("secondes seules sous la minute", () => {
    expect(formatElapsed(s(12), U)).toBe("12 s");
    expect(formatElapsed(s(59), U)).toBe("59 s");
  });

  it("détaille les secondes sous dix minutes", () => {
    expect(formatElapsed(min(1) + s(20), U)).toBe("1 min 20");
    expect(formatElapsed(min(9) + s(5), U)).toBe("9 min 05");
  });

  it("cesse de détailler au-delà de dix minutes : les chiffres ne doivent pas danser", () => {
    expect(formatElapsed(min(10) + s(37), U)).toBe("10 min");
    expect(formatElapsed(min(42), U)).toBe("42 min");
  });

  it("passe aux heures, minutes sur deux chiffres", () => {
    expect(formatElapsed(h(1) + min(5), U)).toBe("1 h 05");
    expect(formatElapsed(h(2) + min(30), U)).toBe("2 h 30");
  });

  it("ne produit jamais de durée négative", () => {
    expect(formatElapsed(-5_000, U)).toBe("0 s");
  });

  it("bascule exactement aux frontières", () => {
    expect(formatElapsed(min(1) - 1, U)).toBe("59 s");
    expect(formatElapsed(min(1), U)).toBe("1 min 00");
    expect(formatElapsed(h(1) - 1, U)).toBe("59 min");
    expect(formatElapsed(h(1), U)).toBe("1 h 00");
  });
});

describe("seuil d'affichage", () => {
  it("reste muet sous le seuil : la plupart des étapes durent moins d'une seconde", () => {
    expect(visibleElapsed(0, MIN_VISIBLE_MS - 1, U)).toBeNull();
    expect(visibleElapsed(0, 0, U)).toBeNull();
  });

  it("apparaît au seuil", () => {
    expect(visibleElapsed(0, MIN_VISIBLE_MS, U)).toBe("4 s");
  });

  it("une horloge en retard sur le début ne fait rien apparaître", () => {
    expect(visibleElapsed(10_000, 9_000, U)).toBeNull();
  });
});
