import { describe, expect, it } from "vitest";
import { readableExcerpt } from "./source-excerpt";

describe("readableExcerpt", () => {
  it("retire le fragment de mot qui ouvre un passage coupé", () => {
    expect(readableExcerpt("xercice 2 Un transistor NPN au silicium est polarisé")).toBe("2 Un transistor NPN au silicium est polarisé");
    expect(readableExcerpt("s, amplificateur à transistors à effet de champ")).toBe("amplificateur à transistors à effet de champ");
    expect(readableExcerpt(") et la tension de seuil vaut 0,7 V")).toBe("et la tension de seuil vaut 0,7 V");
  });

  it("laisse tel quel un passage qui commence correctement", () => {
    expect(readableExcerpt("Exercice 2 Un transistor NPN")).toBe("Exercice 2 Un transistor NPN");
    expect(readableExcerpt("2. Polarisation du transistor")).toBe("2. Polarisation du transistor");
    expect(readableExcerpt("- premier point de la liste")).toBe("- premier point de la liste");
    expect(readableExcerpt("« Citation » d'un auteur")).toBe("« Citation » d'un auteur");
  });

  it("met le texte sur une ligne : les retours à la ligne d'un PDF ne coupent plus les phrases", () => {
    expect(readableExcerpt("Les amplificateurs à transistors à effet\nde\nchamp, amplificateur\n\n  à transistor")).toBe(
      "Les amplificateurs à transistors à effet de champ, amplificateur à transistor",
    );
  });

  it("borne la longueur sur une frontière de mot et le dit par une ellipse", () => {
    const text = "Les transistors bipolaires " + "amplifient le courant ".repeat(40);
    const out = readableExcerpt(text, 100);
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, -1).endsWith("courant") || out.slice(0, -1).endsWith("amplifient") || out.slice(0, -1).endsWith("le")).toBe(true);
  });

  it("garde un texte court entier et ne casse pas sur le vide", () => {
    expect(readableExcerpt("Un mot")).toBe("Un mot");
    expect(readableExcerpt("")).toBe("");
    expect(readableExcerpt(null)).toBe("");
    expect(readableExcerpt(undefined)).toBe("");
    expect(readableExcerpt("   \n  ")).toBe("");
  });

  it("ne vide jamais un passage dont tout est un seul fragment", () => {
    expect(readableExcerpt("amplificateur")).toBe("amplificateur");
    expect(readableExcerpt("s, ")).toBe("s,");
  });
});
