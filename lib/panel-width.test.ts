import { describe, expect, it } from "vitest";
import { clampPanelWidth, PANEL_MIN_WIDTH, readPanelWidth } from "./panel-width";

describe("clampPanelWidth", () => {
  it("garde une largeur raisonnable telle quelle", () => {
    expect(clampPanelWidth(700, 1600)).toBe(700);
  });

  it("ne descend jamais sous le minimum lisible", () => {
    expect(clampPanelWidth(10, 1600)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(-50, 1600)).toBe(PANEL_MIN_WIDTH);
  });

  it("ne laisse jamais le panneau manger toute la fenêtre", () => {
    expect(clampPanelWidth(1500, 1600)).toBe(1280); // 80 %
  });

  // Une largeur enregistrée sur un moniteur large, relue sur un portable : sans ce ramené, le panneau
  // couvrait la conversation entière et aucun geste ne permettait de le réduire.
  it("ramène une largeur venue d'un écran plus grand", () => {
    expect(clampPanelWidth(1400, 1000)).toBe(800);
  });

  // Fenêtre plus étroite que le minimum : on garde le minimum plutôt qu'une largeur inutilisable.
  it("préfère le minimum à une fenêtre minuscule", () => {
    expect(clampPanelWidth(500, 300)).toBe(PANEL_MIN_WIDTH);
  });

  it("refuse une valeur qui n'est pas un nombre", () => {
    expect(clampPanelWidth(Number.NaN, 1600)).toBe(PANEL_MIN_WIDTH);
  });
});

describe("readPanelWidth", () => {
  it("relit une largeur enregistrée, bornée à la fenêtre du moment", () => {
    expect(readPanelWidth("700", 1600)).toBe(700);
    expect(readPanelWidth("1400", 1000)).toBe(800);
  });

  it("rend null pour tout ce qui n'est pas utilisable — la largeur par défaut s'applique", () => {
    expect(readPanelWidth(null, 1600)).toBeNull();
    expect(readPanelWidth("", 1600)).toBeNull();
    expect(readPanelWidth("large", 1600)).toBeNull();
    expect(readPanelWidth("0", 1600)).toBeNull();
    expect(readPanelWidth("-20", 1600)).toBeNull();
  });
});
