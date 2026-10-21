// @vitest-environment node
// La passerelle /api/donna/<chemin> : autorisation de route, retransmission, et le
// renouvellement de jeton sur 401 — Phase 2 frontend (frontendAnalyse.md) : purge des cookies
// quand le rafraîchissement échoue aussi, pour que ce chemin se comporte comme
// proxy.ts::guardApp dans le même cas.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const deleted: string[] = [];
const set: Array<{ name: string; value: string }> = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { value: store.get(name) } : undefined),
    set: (name: string, value: string) => {
      store.set(name, value);
      set.push({ name, value });
    },
    delete: (name: string) => {
      store.delete(name);
      deleted.push(name);
    },
  }),
}));
vi.mock("@/lib/backend", () => ({ BACKEND_URL: "http://backend" }));

import { GET } from "./route";

const call = (path: string) =>
  GET(new NextRequest(`http://app.test/api/donna/${path}`), { params: Promise.resolve({ path: path.split("/") }) } as never);

beforeEach(() => {
  store.clear();
  deleted.length = 0;
  set.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /api/donna/chat — renouvellement de jeton sur 401", () => {
  it("un jeton d'accès renouvelé avec succès remplace les deux cookies, rien n'est supprimé", async () => {
    store.set("donna_access", "access-expire");
    store.set("donna_refresh", "refresh-valide");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/auth/refresh")) {
          return { ok: true, json: async () => ({ access_token: "access-neuf", refresh_token: "refresh-neuf" }) };
        }
        // Le premier appel (ancien jeton) échoue, le second (jeton renouvelé) réussit.
        const usedNewToken = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some(
          (c) => (c[1] as { headers: Record<string, string> })?.headers?.authorization === "Bearer access-neuf",
        );
        return new Response("ok", { status: usedNewToken ? 200 : 401 });
      }),
    );

    const response = await call("chat");
    expect(response.status).toBe(200);
    expect(set).toEqual([
      { name: "donna_access", value: "access-neuf" },
      { name: "donna_refresh", value: "refresh-neuf" },
    ]);
    expect(deleted).toEqual([]);
  });

  it("un jeton d'accès expiré ET un refresh mort purgent les deux cookies (comme proxy.ts::guardApp)", async () => {
    store.set("donna_access", "access-expire");
    store.set("donna_refresh", "refresh-mort");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/auth/refresh")) return { ok: false };
        return new Response("non autorisé", { status: 401 });
      }),
    );

    const response = await call("chat");
    expect(response.status).toBe(401);
    expect(deleted.sort()).toEqual(["donna_access", "donna_refresh"]);
    expect(set).toEqual([]);
  });

  it("un 401 sans cookie de refresh à tenter ne purge rien (il n'y a rien à renouveler)", async () => {
    store.set("donna_access", "access-expire");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("non autorisé", { status: 401 })));

    const response = await call("chat");
    expect(response.status).toBe(401);
    expect(deleted).toEqual([]);
  });
});

describe("GET /api/donna/... — filtrage des routes autorisées (ALLOWED)", () => {
  it("refuse les chemins non autorisés avec un statut 404 sans appeler le backend", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    store.set("donna_access", "access-valide");

    const response = await call("admin/system");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ detail: "Not found" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("autorise les chemins valides de l'allowlist et les transmet au backend", async () => {
    store.set("donna_access", "access-valide");
    const fetchSpy = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const paths = ["chat", "profile/me", "workflows/runs", "auth/me", "auth/ws/ticket"];
    for (const path of paths) {
      const response = await call(path);
      expect(response.status).toBe(200);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(paths.length);
  });
});
