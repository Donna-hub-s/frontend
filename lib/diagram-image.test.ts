import { describe, expect, it } from "vitest";
import { MAX_SIDE, exportDimensions, svgToPngBase64, withExplicitSize, withPlainLabels } from "./diagram-image";

const MERMAID = '<svg id="m1" width="100%" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" style="max-width: 400px;" role="graphics-document document"><g><text style="fill:red">A</text></g></svg>';

describe("withExplicitSize", () => {
  it("donne une taille en pixels à la balise racine et retire le width en % et le style", () => {
    const out = withExplicitSize(MERMAID, { width: 400, height: 120 });
    expect(out).toContain('width="400" height="120">');
    expect(out).not.toContain('width="100%"');
    expect(out).not.toContain("max-width");
    expect(out).toContain('viewBox="0 0 400 120"');
  });

  it("ne touche pas au dessin : un style plus bas dans le SVG reste en place", () => {
    expect(withExplicitSize(MERMAID, { width: 400, height: 120 })).toContain('<text style="fill:red">A</text>');
  });
});

describe("exportDimensions", () => {
  it("dessine à l'échelle 2", () => {
    expect(exportDimensions({ width: 400, height: 120 })).toEqual({ width: 800, height: 240 });
  });

  it("réduit quand le plus grand côté dépasse le plafond du serveur, en gardant les proportions", () => {
    const out = exportDimensions({ width: 4000, height: 100 });
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(MAX_SIDE);
    expect(out.width / out.height).toBeCloseTo(40, 0);
  });

  it("ne produit jamais une dimension nulle", () => {
    expect(exportDimensions({ width: 0.2, height: 0.2 })).toEqual({ width: 1, height: 1 });
  });
});

describe("withPlainLabels", () => {
  const directive = '%%{init: {"htmlLabels": false, "flowchart": {"htmlLabels": false}}}%%\n';

  it("pose la directive en tête", () => {
    expect(withPlainLabels("graph TD\nA-->B")).toBe(`${directive}graph TD\nA-->B`);
  });

  it("la pose APRÈS un bloc --- de métadonnées, qui doit rester le premier", () => {
    const source = "---\ntitle: Compétences\n---\ngraph TD\nA-->B";
    expect(withPlainLabels(source)).toBe(`---\ntitle: Compétences\n---\n${directive}graph TD\nA-->B`);
  });

  it("ne prend pas un simple « --- » du diagramme pour des métadonnées", () => {
    expect(withPlainLabels("graph TD\nA-->B\n---\nC")).toBe(`${directive}graph TD\nA-->B\n---\nC`);
  });
});

describe("svgToPngBase64", () => {
  it("renvoie null (sans lever) quand il n'y a pas de navigateur pour dessiner ou que la taille est illisible", async () => {
    expect(await svgToPngBase64("<svg>")).toBeNull();
    expect(await svgToPngBase64(MERMAID)).toBeNull(); // environnement de test sans DOM : le diagramme reste un bloc de code dans l'export
  });
});
