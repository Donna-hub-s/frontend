import { describe, expect, it } from "vitest";
import type { SourceOut } from "./api";
import { visibleSources } from "./sources";

const source = (over: Partial<SourceOut>): SourceOut => ({ doc_id: "d1", original_name: "cours.pdf", excerpt: "un passage", file_url: "/f", ...over });

describe("visibleSources", () => {
  it("garde chaque passage lu, dans l'ordre", () => {
    const a = source({ doc_id: "a", excerpt: "premier" });
    const b = source({ doc_id: "b", excerpt: "second" });
    expect(visibleSources([a, b])).toEqual([a, b]);
  });

  it("garde plusieurs passages d'un même document mais pas deux fois le même", () => {
    const first = source({ excerpt: "passage 1" });
    const second = source({ excerpt: "passage 2" });
    expect(visibleSources([first, second, { ...first }])).toEqual([first, second]);
  });

  it("écarte un fichier produit par DONNA (sans extrait) : il est déjà dans « Fichiers »", () => {
    const read = source({ excerpt: "texte lu" });
    const produced = source({ doc_id: "f1", original_name: "exoplanetes.png", excerpt: "" });
    const blank = source({ doc_id: "f2", original_name: "stats.xlsx", excerpt: "  \n " });
    expect(visibleSources([read, produced, blank])).toEqual([read]);
  });

  it("rend une liste vide pour rien, null ou seulement des fichiers produits", () => {
    expect(visibleSources(undefined)).toEqual([]);
    expect(visibleSources(null)).toEqual([]);
    expect(visibleSources([source({ excerpt: "" })])).toEqual([]);
  });
});
