import { describe, expect, it } from "vitest";
import { linkHref, parseLinkRequest, safeReturnPath } from "./oauth-link";

describe("safeReturnPath", () => {
  it("accepte une page de l'espace de travail, dans la langue courante", () => {
    expect(safeReturnPath("fr", "/fr/app")).toBe("/fr/app");
    expect(safeReturnPath("fr", "/fr/app/c/3f2a-9b")).toBe("/fr/app/c/3f2a-9b");
    expect(safeReturnPath("en", "/en/app/projects/p1/")).toBe("/en/app/projects/p1/");
  });

  it("retire la requête et le fragment, qui pourraient porter un jeton", () => {
    expect(safeReturnPath("fr", "/fr/app/c/abc?token=secret#haut")).toBe("/fr/app/c/abc");
    expect(safeReturnPath("fr", "/fr/app?settings=1")).toBe("/fr/app");
  });

  it.each([
    ["adresse absolue", "https://evil.example/fr/app"],
    ["adresse relative au protocole", "//evil.example/fr/app"],
    ["autre langue", "/en/app"],
    ["hors de l'espace de travail", "/fr/login"],
    ["préfixe trompeur", "/fr/application"],
    ["remontée de dossier", "/fr/app/../../etc"],
    ["double barre", "/fr/app//evil.example"],
    ["antislash", "/fr/app/\\evil"],
    ["caractère de contrôle", "/fr/app/c/\n"],
    ["schéma dangereux", "javascript:alert(1)"],
    ["vide", ""],
  ])("refuse %s", (_label, value) => expect(safeReturnPath("fr", value)).toBeNull());

  it("refuse l'absence de valeur", () => {
    expect(safeReturnPath("fr", null)).toBeNull();
    expect(safeReturnPath("fr", undefined)).toBeNull();
  });
});

describe("linkHref", () => {
  const read = (href: string) => new URL(href, "http://x").searchParams;

  it("un lien par service, avec le chemin de retour", () => {
    const href = linkHref("fr", { services: ["gmail"], next: "/fr/app/c/abc" });
    expect(href.startsWith("/oauth/google?")).toBe(true);
    const params = read(href);
    expect([params.get("lang"), params.get("link"), params.get("services"), params.get("next")]).toEqual(["fr", "1", "gmail", "/fr/app/c/abc"]);
  });

  it("plusieurs services, séparés par des virgules", () => {
    expect(read(linkHref("fr", { services: ["gmail", "drive"] })).get("services")).toBe("gmail,drive");
  });

  it("sans service, tout est demandé : aucun paramètre `services`", () => {
    expect(read(linkHref("fr")).has("services")).toBe(false);
    expect(read(linkHref("fr", { services: [] })).has("services")).toBe(false);
  });

  it("n'emporte jamais un chemin de retour douteux", () => {
    expect(read(linkHref("fr", { next: "https://evil.example" })).has("next")).toBe(false);
    expect(read(linkHref("fr", { next: "/fr/login" })).has("next")).toBe(false);
  });
});

describe("parseLinkRequest", () => {
  const parse = (query: string) => parseLinkRequest(new URLSearchParams(query), "fr");

  it("relit ce que linkHref a écrit", () => {
    const href = linkHref("fr", { services: ["calendar", "drive"], next: "/fr/app/c/abc" });
    expect(parseLinkRequest(new URL(href, "http://x").searchParams, "fr")).toEqual({ services: ["calendar", "drive"], next: "/fr/app/c/abc" });
  });

  it("ne garde que les services connus, une fois chacun", () => {
    expect(parse("services=gmail,evil,gmail,%20drive%20,").services).toEqual(["gmail", "drive"]);
    expect(parse("services=constructor,__proto__").services).toEqual([]);
  });

  it("écarte un chemin de retour hors de l'espace de travail", () => {
    expect(parse("next=https%3A%2F%2Fevil.example").next).toBeNull();
    expect(parse("next=%2Fen%2Fapp").next).toBeNull(); // autre langue que celle de la requête
    expect(parse("").next).toBeNull();
  });
});
