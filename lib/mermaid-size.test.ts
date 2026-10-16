import { describe, expect, it } from "vitest";
import { MIN_SCALE, ZOOMS, fitZoom, initialZoom, inlineBox, naturalSize, stepZoom, zoomedWidth } from "./mermaid-size";

describe("naturalSize", () => {
  it("lit la taille du viewBox de Mermaid", () => {
    expect(naturalSize('<svg width="100%" viewBox="0 0 1713.265625 70" style="max-width: 1713px">')).toEqual({ width: 1713.265625, height: 70 });
  });

  it("accepte une origine négative, des virgules et des espaces en trop", () => {
    expect(naturalSize('<svg viewBox="-8, -8, 300 120">')).toEqual({ width: 300, height: 120 });
    expect(naturalSize('<svg viewBox=" 0 0 300 120 ">')).toEqual({ width: 300, height: 120 });
  });

  it("refuse ce qui n'a pas de sens plutôt que de deviner", () => {
    expect(naturalSize("<svg>")).toBeNull();
    expect(naturalSize('<svg viewBox="0 0 0 120">')).toBeNull();
    expect(naturalSize('<svg viewBox="0 0 300 -5">')).toBeNull();
  });
});

describe("inlineBox — la bande de 25 px du bug d'origine", () => {
  it("garde la taille naturelle d'un diagramme qui tient dans la colonne", () => {
    expect(inlineBox({ width: 400, height: 200 }).width).toBe(`max(min(100%, 400px), ${Math.round(400 * MIN_SCALE)}px)`);
  });

  it("ne descend jamais sous MIN_SCALE de la taille naturelle : un diagramme en ligne défile au lieu d'être écrasé", () => {
    const box = inlineBox({ width: 1713, height: 70 });
    // Le plancher en pixels (≈ 1199 px) l'emporte sur 100 % d'une colonne de 628 px : la hauteur suit le rapport, donc ≈ 49 px, pas 25.
    expect(box.width).toBe(`max(min(100%, 1713px), ${Math.round(1713 * MIN_SCALE)}px)`);
    expect(box.aspectRatio).toBe("1713 / 70");
    const floor = 1713 * MIN_SCALE;
    expect(floor / (1713 / 70)).toBeGreaterThan(40); // hauteur de l'iframe au plancher
    expect(628 / (1713 / 70)).toBeLessThan(26); // ce que donnait l'ancien cadre à 100 % de la colonne
  });
});

describe("zoom", () => {
  it("monte et descend par paliers et s'arrête aux bornes", () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(ZOOMS[ZOOMS.length - 1], 1)).toBe(3);
    expect(stepZoom(ZOOMS[0], -1)).toBe(0.5);
  });

  it("depuis un niveau hors liste, va au voisin dans le sens demandé", () => {
    expect(stepZoom(0.6, 1)).toBe(0.75);
    expect(stepZoom(0.6, -1)).toBe(0.5);
    expect(stepZoom(1.2, 1)).toBe(1.5);
  });

  it("ajuste la largeur à l'espace disponible, dans les bornes", () => {
    expect(fitZoom({ width: 2000, height: 100 }, 1000)).toBe(0.5);
    expect(fitZoom({ width: 100, height: 100 }, 1000)).toBe(3);
    expect(fitZoom({ width: 4000, height: 100 }, 1000)).toBe(0.5); // plancher : au-delà, on défile
    expect(fitZoom({ width: 400, height: 100 }, 0)).toBe(1);
  });

  it("donne la largeur en pixels à un zoom", () => {
    expect(zoomedWidth({ width: 333, height: 10 }, 1.5)).toBe(500);
  });
});

describe("initialZoom — le grand affichage s'ouvre sur du texte lisible", () => {
  it("prend la taille naturelle quand elle tient", () => {
    expect(initialZoom({ width: 600, height: 300 }, 900)).toBe(1);
    expect(initialZoom({ width: 100, height: 300 }, 900)).toBe(1); // jamais agrandi d'office
  });

  it("réduit pour tenir, mais pas sous 75 % : un diagramme très large défile au lieu de devenir illisible", () => {
    expect(initialZoom({ width: 1000, height: 300 }, 800)).toBe(0.8);
    expect(initialZoom({ width: 1713, height: 70 }, 696)).toBe(0.75);
  });
});
