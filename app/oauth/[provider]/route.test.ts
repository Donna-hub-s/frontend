// @vitest-environment node
// La route qui démarre une liaison : elle transmet les services demandés au backend et ramène sur la page d'où l'on vient.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let token: string | undefined = "jeton-d-acces";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (token ? { value: token } : undefined) }) }));
vi.mock("@/lib/backend", () => ({ BACKEND_URL: "http://backend", getOAuthProviders: async () => ["google", "github"] }));

import { GET } from "./route";

const APP = "http://app.test";
/** Les adresses d'autorisation demandées au backend, dans l'ordre. */
let asked: string[] = [];

const hit = (query: string, provider = "google") =>
  GET(new NextRequest(`${APP}/oauth/${provider}?${query}`), { params: Promise.resolve({ provider }) } as never);
const authorize = () => new URL(asked.at(-1)!);

beforeEach(() => {
  token = "jeton-d-acces";
  asked = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      return { ok: true, json: async () => ({ auth_url: "https://accounts.google.com/o/oauth2/v2/auth?state=s" }) };
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /oauth/google?link=1", () => {
  it("ne demande à Google que le service choisi, et le dit au backend", async () => {
    const response = await hit("lang=fr&link=1&services=gmail");
    expect(authorize().searchParams.get("services")).toBe("gmail");
    expect(response.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=s");
  });

  it("transmet plusieurs services dans l'ordre reçu, sans doublon ni service inconnu", async () => {
    await hit("lang=fr&link=1&services=drive,evil,gmail,drive");
    expect(authorize().searchParams.get("services")).toBe("drive,gmail");
  });

  it("sans service, tout est demandé : aucun paramètre transmis", async () => {
    await hit("lang=fr&link=1");
    expect(authorize().searchParams.has("services")).toBe(false);
  });

  it("ramène sur la page d'où l'on vient", async () => {
    await hit("lang=fr&link=1&services=drive&next=%2Ffr%2Fapp%2Fc%2Fabc-123");
    expect(authorize().searchParams.get("redirect")).toBe(`${APP}/fr/app/c/abc-123`);
  });

  it("sans chemin de retour : l'accueil de l'espace de travail, comme avant", async () => {
    await hit("lang=fr&link=1");
    expect(authorize().searchParams.get("redirect")).toBe(`${APP}/fr/app`);
  });

  it.each([
    ["adresse absolue", "https%3A%2F%2Fevil.example%2Fsteal"],
    ["adresse relative au protocole", "%2F%2Fevil.example"],
    ["page hors de l'espace de travail", "%2Ffr%2Flogin"],
    ["autre langue", "%2Fen%2Fapp"],
  ])("un chemin de retour forgé (%s) retombe sur l'accueil", async (_label, next) => {
    await hit(`lang=fr&link=1&services=gmail&next=${next}`);
    expect(authorize().searchParams.get("redirect")).toBe(`${APP}/fr/app`);
  });

  it("n'envoie pas de services aux autres fournisseurs", async () => {
    await hit("lang=fr&link=1&services=gmail", "github");
    expect(authorize().searchParams.has("services")).toBe(false);
  });

  it("l'appel au backend porte le jeton de l'utilisateur : c'est lui qui fait une LIAISON et non une connexion", async () => {
    await hit("lang=fr&link=1&services=gmail");
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(call[1].headers.authorization).toBe("Bearer jeton-d-acces");
  });

  it("sans session, renvoie vers la connexion sans rien demander au backend", async () => {
    token = undefined;
    const response = await hit("lang=fr&link=1&services=gmail");
    expect(asked).toEqual([]);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/fr/login");
  });
});

describe("GET /oauth/google (connexion)", () => {
  it("la connexion ignore services et next : elle demande tout et passe directement par le backend", async () => {
    const response = await hit("lang=fr&services=gmail&next=%2Ffr%2Fapp%2Fc%2Fabc");
    expect(asked).toEqual([]); // pas d'appel authentifié : le navigateur est envoyé au backend
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/app/auth/oauth/google/authorize");
    expect(target.searchParams.get("direct")).toBe("true");
    expect(target.searchParams.has("services")).toBe(false);
  });
});
