import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Chaque test importe un module frais : installSessionGuard/redirectToLogin
 * gardent un état module-level (`installed`, `redirecting`) volontairement
 * non réinitialisable en prod (voir session-guard.ts) — un test isolé a
 * besoin de sa propre instance du module pour ne pas hériter de l'état du
 * test précédent. */
async function freshModule() {
  vi.resetModules();
  return import("./session-guard");
}

function stubLocation(overrides: Partial<Location> = {}) {
  const replace = vi.fn();
  vi.stubGlobal("location", {
    pathname: "/fr/app/c/123",
    search: "",
    origin: "http://localhost:4200",
    replace,
    ...overrides,
  } as unknown as Location);
  return replace;
}

describe("redirectToLogin", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renvoie vers /login avec next=chemin courant depuis /fr/app/*", async () => {
    const replace = stubLocation({ pathname: "/fr/app/c/123", search: "?foo=bar" });
    const { redirectToLogin } = await freshModule();

    redirectToLogin();

    expect(replace).toHaveBeenCalledTimes(1);
    const target = new URL(replace.mock.calls[0][0]);
    expect(target.pathname).toBe("/fr/login");
    expect(target.searchParams.get("error")).toBe("sessionExpired");
    expect(target.searchParams.get("next")).toBe("/fr/app/c/123?foo=bar");
  });

  it("n'ajoute pas de next hors de /<lang>/app (ex: page d'accueil)", async () => {
    const replace = stubLocation({ pathname: "/fr/fondations", search: "" });
    const { redirectToLogin } = await freshModule();

    redirectToLogin();

    const target = new URL(replace.mock.calls[0][0]);
    expect(target.searchParams.has("next")).toBe(false);
  });

  it("retombe sur la locale par défaut si le segment d'URL n'en est pas une", async () => {
    const replace = stubLocation({ pathname: "/app/c/123", search: "" });
    const { redirectToLogin } = await freshModule();

    redirectToLogin();

    const target = new URL(replace.mock.calls[0][0]);
    expect(target.pathname).toBe("/fr/login");
  });

  it("ne boucle pas : un 401 déjà sur /login ne redirige pas", async () => {
    const replace = stubLocation({ pathname: "/fr/login", search: "" });
    const { redirectToLogin } = await freshModule();

    redirectToLogin();

    expect(replace).not.toHaveBeenCalled();
  });

  it("est idempotent : un second appel après le premier ne redirige pas deux fois", async () => {
    const replace = stubLocation({ pathname: "/fr/app", search: "" });
    const { redirectToLogin } = await freshModule();

    redirectToLogin();
    redirectToLogin();

    expect(replace).toHaveBeenCalledTimes(1);
  });
});

describe("installSessionGuard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirige sur un 401 venant de /api/donna/*", async () => {
    const replace = stubLocation({ pathname: "/fr/app", search: "" });
    const originalFetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", originalFetch);
    const { installSessionGuard } = await freshModule();

    installSessionGuard();
    await window.fetch("/api/donna/chat/", {});

    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("ignore un 401 venant d'une origine hors passerelle DONNA", async () => {
    const replace = stubLocation({ pathname: "/fr/app", search: "" });
    const originalFetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", originalFetch);
    const { installSessionGuard } = await freshModule();

    installSessionGuard();
    await window.fetch("https://accounts.google.com/o/oauth2/token", {});

    expect(replace).not.toHaveBeenCalled();
  });

  it("ne redirige pas sur une réponse 200 de /api/donna/*", async () => {
    const replace = stubLocation({ pathname: "/fr/app", search: "" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const { installSessionGuard } = await freshModule();

    installSessionGuard();
    await window.fetch("/api/donna/chat/", {});

    expect(replace).not.toHaveBeenCalled();
  });

  it("une seconde installation ne double-patche pas fetch (idempotent)", async () => {
    stubLocation({ pathname: "/fr/app", search: "" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const { installSessionGuard } = await freshModule();

    installSessionGuard();
    const patchedOnce = window.fetch;
    installSessionGuard();

    expect(window.fetch).toBe(patchedOnce);
  });
});
