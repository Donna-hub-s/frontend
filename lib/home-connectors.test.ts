// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFlagStore, missingGoogleServices } from "./home-connectors";

const google = (over: Partial<{ connected: boolean; gmail: boolean; calendar: boolean; drive: boolean }> = {}) => ({
  connected: true, gmail: false, calendar: false, drive: false, detail: "", ...over,
});

describe("missingGoogleServices", () => {
  it("liste ce qui manque, dans l'ordre d'affichage", () => {
    expect(missingGoogleServices(google())).toEqual(["gmail", "calendar", "drive"]);
    expect(missingGoogleServices(google({ calendar: true }))).toEqual(["gmail", "drive"]);
    expect(missingGoogleServices(google({ gmail: true, drive: true }))).toEqual(["calendar"]);
  });

  it("ne dit rien quand tout est autorisé", () => {
    expect(missingGoogleServices(google({ gmail: true, calendar: true, drive: true }))).toEqual([]);
  });

  it("ne dit rien quand l'état est inconnu : on ne prétend pas « à brancher » sans savoir", () => {
    expect(missingGoogleServices(null)).toEqual([]);
    expect(missingGoogleServices(undefined)).toEqual([]);
  });

  it("Google non relié : les trois manquent", () => {
    expect(missingGoogleServices(google({ connected: false }))).toEqual(["gmail", "calendar", "drive"]);
  });
});

describe("createFlagStore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("démarre à faux, se souvient, et prévient ceux qui écoutent", () => {
    const store = createFlagStore("test.flag");
    const heard = vi.fn();
    const stop = store.subscribe(heard);
    expect(store.read()).toBe(false);
    store.set();
    expect(store.read()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    store.set();
    expect(heard).toHaveBeenCalledTimes(1); // plus à l'écoute
  });

  it("survit au rechargement : une nouvelle instance relit le navigateur", () => {
    createFlagStore("test.flag").set();
    expect(createFlagStore("test.flag").read()).toBe(true);
    expect(createFlagStore("autre.clé").read()).toBe(false);
  });

  it("réagit à un autre onglet qui l'a masqué", () => {
    const store = createFlagStore("test.flag");
    const heard = vi.fn();
    store.subscribe(heard);
    window.dispatchEvent(new StorageEvent("storage", { key: "test.flag" }));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("marche encore quand le stockage est interdit : l'indicateur tient dans la page", () => {
    const boom = () => {
      throw new Error("SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    const store = createFlagStore("test.flag");
    expect(store.read()).toBe(false); // lecture impossible : pas de plantage, simplement « pas masqué »
    store.set();
    expect(store.read()).toBe(true);
  });
});
