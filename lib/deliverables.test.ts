import { describe, expect, it } from "vitest";
import { conversationHref, deliverablesUrl, extensionOf, fileUrl, hasMore, mergePages, PAGE_SIZE, queryKey, type DeliverableFile } from "./deliverables";

const file = (id: string): DeliverableFile => ({
  id,
  name: `${id}.pdf`,
  kind: "document",
  mime_type: "application/pdf",
  conversation_id: "c1",
  conversation_title: "Audit",
  created_at: "2026-10-05T10:00:00Z",
  on_shown_branch: true,
});

describe("deliverablesUrl", () => {
  it("n'envoie que les filtres utiles", () => {
    expect(deliverablesUrl({ q: "", kind: "all", abandoned: false })).toBe(`/api/donna/chat/deliverables?limit=${PAGE_SIZE}`);
    expect(deliverablesUrl({ q: "  bilan  ", kind: "image", abandoned: true, offset: 30, limit: 10 })).toBe(
      "/api/donna/chat/deliverables?q=bilan&kind=image&abandoned=true&offset=30&limit=10",
    );
  });

  it("encode ce qui est saisi : un nom peut contenir & = # ou un espace", () => {
    const url = deliverablesUrl({ q: "a&b=c #1", kind: "all", abandoned: false });
    expect(url).toContain("q=a%26b%3Dc+%231");
    expect(new URL(url, "http://x").searchParams.get("q")).toBe("a&b=c #1");
  });
});

describe("queryKey", () => {
  it("identifie une recherche sans tenir compte des espaces autour", () => {
    expect(queryKey({ q: " x ", kind: "all", abandoned: false })).toBe(queryKey({ q: "x", kind: "all", abandoned: false }));
    expect(queryKey({ q: "x", kind: "all", abandoned: false })).not.toBe(queryKey({ q: "x", kind: "image", abandoned: false }));
    expect(queryKey({ q: "x", kind: "all", abandoned: false })).not.toBe(queryKey({ q: "x", kind: "all", abandoned: true }));
  });
});

describe("mergePages", () => {
  it("ajoute la page suivante en gardant l'ordre du serveur", () => {
    expect(mergePages([file("a"), file("b")], [file("c")]).map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("ne répète pas un fichier quand un nouveau a décalé les pages", () => {
    // « b » était la dernière ligne de la page 1 ; un fichier produit entre-temps la fait revenir en tête de la page 2.
    expect(mergePages([file("a"), file("b")], [file("b"), file("c")]).map((f) => f.id)).toEqual(["a", "b", "c"]);
    expect(mergePages([], [file("x"), file("x")]).map((f) => f.id)).toEqual(["x"]);
  });
});

describe("hasMore", () => {
  it("compare ce qui est affiché au total du serveur", () => {
    expect(hasMore(7, 3)).toBe(true);
    expect(hasMore(7, 7)).toBe(false);
    expect(hasMore(0, 0)).toBe(false);
  });
});

describe("extensionOf", () => {
  it("donne l'extension en capitales", () => {
    expect(extensionOf("rapport.final.pdf")).toBe("PDF");
    expect(extensionOf("tableau.xlsx")).toBe("XLSX");
  });

  it("ne devine rien quand il n'y en a pas", () => {
    expect(extensionOf("README")).toBe("");
    expect(extensionOf(".env")).toBe("");
    expect(extensionOf("fichier.")).toBe("");
  });
});

describe("liens", () => {
  it("encode les identifiants", () => {
    expect(fileUrl("a/b c")).toBe("/api/donna/chat/attachments/a%2Fb%20c/file");
    expect(conversationHref("fr", "c 1")).toBe("/fr/app/c/c%201");
  });
});
