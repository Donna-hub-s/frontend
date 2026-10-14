// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collapsedServerSnapshot, collapsedSnapshot, resetCollapsedForTests, subscribeCollapsed, toggleCollapsed } from "./sidebar-collapsed";

beforeEach(() => {
  localStorage.clear();
  resetCollapsedForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("barre latérale rétractée", () => {
  it("est déployée par défaut, des deux côtés du rendu", () => {
    expect(collapsedSnapshot()).toBe(false);
    expect(collapsedServerSnapshot()).toBe(false);
  });

  it("se rétracte, se retient, et prévient ce qui l'écoute", () => {
    const seen = vi.fn();
    const unsubscribe = subscribeCollapsed(seen);
    toggleCollapsed();
    expect(collapsedSnapshot()).toBe(true);
    expect(localStorage.getItem("donna:sidebar-collapsed")).toBe("1");
    expect(seen).toHaveBeenCalledTimes(1);
    toggleCollapsed();
    expect(collapsedSnapshot()).toBe(false);
    unsubscribe();
    toggleCollapsed();
    expect(seen).toHaveBeenCalledTimes(2); // désabonné : plus prévenu
  });

  // React boucle si `getSnapshot` rend une valeur différente sans que rien n'ait changé.
  it("rend toujours le même instantané tant que rien ne change", () => {
    localStorage.setItem("donna:sidebar-collapsed", "1");
    expect(collapsedSnapshot()).toBe(true);
    localStorage.setItem("donna:sidebar-collapsed", "0"); // écrit hors du store, sans événement
    expect(collapsedSnapshot()).toBe(true);
  });

  it("suit le réglage changé dans un autre onglet", () => {
    const seen = vi.fn();
    subscribeCollapsed(seen);
    localStorage.setItem("donna:sidebar-collapsed", "1");
    window.dispatchEvent(new StorageEvent("storage", { key: "donna:sidebar-collapsed" }));
    expect(collapsedSnapshot()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("ignore un autre réglage du même stockage", () => {
    const seen = vi.fn();
    subscribeCollapsed(seen);
    window.dispatchEvent(new StorageEvent("storage", { key: "donna:canvas-width" }));
    expect(seen).not.toHaveBeenCalled();
  });

  // Navigation privée stricte : lire jette. La barre reste déployée plutôt que de casser la page.
  it("survit à un stockage refusé", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("refusé");
    });
    expect(collapsedSnapshot()).toBe(false);
  });
});
