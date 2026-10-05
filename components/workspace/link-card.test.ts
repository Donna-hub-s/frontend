import { describe, expect, it } from "vitest";
import { isBareUrlLink, linkCardData } from "./link-card";

describe("linkCardData", () => {
  it("construit la carte à partir d'une URL http(s) propre", () => {
    expect(linkCardData("https://example.com/a/b?x=1")).toEqual({
      href: "https://example.com/a/b?x=1",
      host: "example.com",
      path: "/a/b?x=1",
    });
  });

  it("retire le www. du domaine affiché", () => {
    expect(linkCardData("https://www.example.com")?.host).toBe("example.com");
  });

  it("refuse une phrase contenant un espace, même si elle commence par une URL (régression : new URL() encode le reste en %20 dans le chemin)", () => {
    expect(linkCardData("https://xcorehub.dev est pas deja en ligne")).toBeNull();
    expect(linkCardData("regarde https://example.com stp")).toBeNull();
  });

  it("refuse les protocoles autres que http(s)", () => {
    expect(linkCardData("mailto:a@b.com")).toBeNull();
    expect(linkCardData("/app/chat")).toBeNull();
  });

  it("refuse une valeur absente", () => {
    expect(linkCardData(undefined)).toBeNull();
  });
});

describe("isBareUrlLink", () => {
  it("vrai seulement quand le texte du lien est exactement l'URL", () => {
    expect(isBareUrlLink("https://example.com", "https://example.com")).toBe(true);
    expect(isBareUrlLink("https://example.com", "  https://example.com  ")).toBe(true);
    expect(isBareUrlLink("https://example.com", "clique ici")).toBe(false);
  });
});
