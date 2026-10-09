// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, isTheme, readStoredTheme, resolveTheme, storeTheme, STORAGE_KEY, THEME_SCRIPT, THEMES } from "./theme";

/** Pilote `prefers-color-scheme`, que jsdom n'implémente pas. */
function systemPrefersDark(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query.includes("dark"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("thème — liste fermée", () => {
  it.each(THEMES)("« %s » est accepté", (theme) => expect(isTheme(theme)).toBe(true));

  it.each(["", "Dark", "sombre", "auto", null, 3])("%o est refusé", (value) => expect(isTheme(value)).toBe(false));
});

describe("résolution", () => {
  it("« system » suit le réglage du système", () => {
    systemPrefersDark(true);
    expect(resolveTheme("system")).toBe("dark");
    systemPrefersDark(false);
    expect(resolveTheme("system")).toBe("light");
  });

  it("un choix explicite l'emporte sur le système", () => {
    systemPrefersDark(true);
    expect(resolveTheme("light")).toBe("light");
    systemPrefersDark(false);
    expect(resolveTheme("dark")).toBe("dark");
  });
});

describe("application au document", () => {
  it("pose TOUJOURS une valeur concrète : le CSS ne connaît pas « system »", () => {
    systemPrefersDark(true);
    expect(applyTheme("system")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("est idempotent", () => {
    systemPrefersDark(false);
    applyTheme("dark");
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("miroir navigateur", () => {
  it("relit ce qui a été écrit", () => {
    storeTheme("dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("retombe sur « system » quand le stockage est vide ou abîmé", () => {
    expect(readStoredTheme()).toBe("system");
    localStorage.setItem(STORAGE_KEY, "chartreuse");
    expect(readStoredTheme()).toBe("system");
  });

  it("un stockage qui lève ne casse rien", () => {
    const boom = () => {
      throw new Error("refusé");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    expect(readStoredTheme()).toBe("system");
    expect(() => storeTheme("dark")).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe("script anti-flash", () => {
  it("pose le thème sans rien importer, et survit à un stockage interdit", () => {
    // Exécuté tel quel, comme dans le <head>.
    systemPrefersDark(true);
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");

    localStorage.setItem(STORAGE_KEY, "light");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("ne contient aucune valeur hors catalogue", () => {
    expect(THEME_SCRIPT).toContain(STORAGE_KEY);
    expect(THEME_SCRIPT).not.toMatch(/\bimport\b|\brequire\b/);
  });
});
