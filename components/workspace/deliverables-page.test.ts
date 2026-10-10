import { describe, expect, it } from "vitest";
import { deliverablesUrl, extensionOf, hasMore, mergePages, queryKey, type DeliverableFile } from "@/lib/deliverables";

describe("deliverables logic & components helper tests", () => {
  it("génère l'URL de requête de livrables correcte avec filtres", () => {
    expect(deliverablesUrl({ q: "rapport", kind: "document", abandoned: true, offset: 10, limit: 20 })).toBe(
      "/api/donna/chat/deliverables?q=rapport&kind=document&abandoned=true&offset=10&limit=20"
    );
  });

  it("génère une clé de requête unique basée sur les filtres", () => {
    const k1 = queryKey({ q: "test", kind: "all", abandoned: false });
    const k2 = queryKey({ q: " test ", kind: "all", abandoned: false });
    expect(k1).toBe(k2);
  });

  it("extrait correctement l'extension de fichier", () => {
    expect(extensionOf("document.pdf")).toBe("PDF");
    expect(extensionOf("archive.tar.gz")).toBe("GZ");
    expect(extensionOf("sans_extension")).toBe("");
  });

  it("fusionne les pages de fichiers sans doublons", () => {
    const file1: DeliverableFile = {
      id: "f1",
      name: "doc1.pdf",
      kind: "document",
      mime_type: "application/pdf",
      conversation_id: "c1",
      conversation_title: "Conv 1",
      created_at: "2026-03-01T10:00:00Z",
      on_shown_branch: true,
    };
    const file2: DeliverableFile = {
      id: "f2",
      name: "img1.png",
      kind: "image",
      mime_type: "image/png",
      conversation_id: "c1",
      conversation_title: "Conv 1",
      created_at: "2026-03-02T10:00:00Z",
      on_shown_branch: true,
    };

    const page1 = [file1];
    const page2 = [file1, file2];

    const merged = mergePages(page1, page2);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe("f1");
    expect(merged[1].id).toBe("f2");
  });

  it("détermine si plus de fichiers sont disponibles via hasMore", () => {
    expect(hasMore(50, 30)).toBe(true);
    expect(hasMore(30, 30)).toBe(false);
  });
});
