import { describe, expect, it } from "vitest";
import { hasMath, normalizeMath } from "./markdown-math";

describe("normalizeMath", () => {
  it("ne touche pas aux montants en dollars", () => {
    for (const text of ["Ça coûte $5 et $10 au total.", "Prix : 1 200 $ puis 300 $ en tout", "Un budget de $1,200 (soit $1.2k)."]) {
      expect(normalizeMath(text)).toBe(text);
    }
  });

  it("garde comme formule un $…$ qui contient du LaTeX", () => {
    expect(normalizeMath("Soit $x^2 + 1$ la formule.")).toBe("Soit $$x^2 + 1$$ la formule.");
    expect(normalizeMath("Avec $\\alpha_i$ et $\\frac{a}{b}$.")).toBe("Avec $$\\alpha_i$$ et $$\\frac{a}{b}$$.");
  });

  it("convertit \\( … \\) en formule en ligne", () => {
    expect(normalizeMath("La somme \\( \\sum_i x_i \\) converge.")).toBe("La somme $$\\sum_i x_i$$ converge.");
  });

  it("convertit \\[ … \\] sur une ligne ou plusieurs lignes en bloc", () => {
    expect(normalizeMath("\\[ E = mc^2 \\]")).toBe("$$\nE = mc^2\n$$");
    expect(normalizeMath("Avant\n\\[\n\\int_0^1 x\\,dx\n= \\frac12\n\\]\nAprès")).toBe("Avant\n$$\n\\int_0^1 x\\,dx\n= \\frac12\n$$\nAprès");
  });

  it("laisse $$ … $$ tel quel", () => {
    expect(normalizeMath("$$\nx^2\n$$")).toBe("$$\nx^2\n$$");
    expect(normalizeMath("Inline $$a_1$$ ici")).toBe("Inline $$a_1$$ ici");
  });

  it("ne touche jamais au code", () => {
    const fenced = "```python\nprix = '$x^2$'\nre = r'\\(a\\)'\n```";
    expect(normalizeMath(`${fenced}\nPuis $a^2$.`)).toBe(`${fenced}\nPuis $$a^2$$.`);
    expect(normalizeMath("Écris `$x^2$` ou `\\(a\\)` puis $b^2$.")).toBe("Écris `$x^2$` ou `\\(a\\)` puis $$b^2$$.");
    expect(normalizeMath("~~~\n$a^2$\n~~~\n")).toBe("~~~\n$a^2$\n~~~\n");
  });

  it("un bloc de code plus long se ferme par son marqueur, pas par un plus court", () => {
    const text = "````\n```\n$a^2$\n```\n$b^2$\n````\n$c^2$";
    expect(normalizeMath(text)).toBe("````\n```\n$a^2$\n```\n$b^2$\n````\n$$c^2$$");
  });

  it("tolère un \\[ jamais refermé (réponse en cours de flux)", () => {
    expect(normalizeMath("Début\n\\[ x^2")).toBe("Début\n\\[\nx^2");
  });

  it("n'a rien à faire sans formule", () => {
    expect(normalizeMath("Du texte simple, `code` et **gras**.")).toBe("Du texte simple, `code` et **gras**.");
  });
});

describe("hasMath", () => {
  it("détecte les notations, pas les montants", () => {
    expect(hasMath("$$x$$")).toBe(true);
    expect(hasMath("\\(x\\)")).toBe(true);
    expect(hasMath("\\[x\\]")).toBe(true);
    expect(hasMath("soit $x^2$")).toBe(true);
    expect(hasMath("coûte $5 et $10")).toBe(false);
  });
});
