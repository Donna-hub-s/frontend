import { describe, expect, it } from "vitest";
import { splitLinks } from "./linkify";

describe("splitLinks", () => {
  it("un texte sans URL reste un seul segment texte", () => {
    expect(splitLinks("bonjour, comment vas-tu ?")).toEqual([{ type: "text", value: "bonjour, comment vas-tu ?" }]);
  });

  it("une chaîne vide reste un seul segment texte vide", () => {
    expect(splitLinks("")).toEqual([{ type: "text", value: "" }]);
  });

  it("une URL au milieu d'une phrase devient trois segments", () => {
    expect(splitLinks("regarde ce site https://example.com stp")).toEqual([
      { type: "text", value: "regarde ce site " },
      { type: "link", href: "https://example.com" },
      { type: "text", value: " stp" },
    ]);
  });

  it("une URL seule devient un seul segment lien, sans texte vide autour", () => {
    expect(splitLinks("https://example.com")).toEqual([{ type: "link", href: "https://example.com" }]);
  });

  it("retire la ponctuation de fin de phrase mais garde les parenthèses équilibrées", () => {
    expect(splitLinks("vu ici: https://x.com/a, et aussi https://x.com/b.")).toEqual([
      { type: "text", value: "vu ici: " },
      { type: "link", href: "https://x.com/a" },
      { type: "text", value: ", et aussi " },
      { type: "link", href: "https://x.com/b" },
      { type: "text", value: "." },
    ]);
    expect(splitLinks("voir https://fr.wikipedia.org/wiki/Mercure_(mythologie)")).toEqual([
      { type: "text", value: "voir " },
      { type: "link", href: "https://fr.wikipedia.org/wiki/Mercure_(mythologie)" },
    ]);
  });

  it("plusieurs URL à la suite sont toutes détectées", () => {
    const text = "https://a.com et https://b.com";
    expect(splitLinks(text).filter((s) => s.type === "link")).toHaveLength(2);
  });
});
