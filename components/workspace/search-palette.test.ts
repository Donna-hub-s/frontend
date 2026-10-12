import { describe, expect, it } from "vitest";
import { filterSearchItems } from "./search-palette";

const labels = {
  newChat: "Nouvelle discussion",
  searchDocProject: "Projet {name}",
  searchDocConversation: "Discussion {title}",
  searchDocPersonal: "Personnel",
};

describe("filterSearchItems", () => {
  it("renvoie la commande nouvelle discussion et les conversations récentes si la requête est vide", () => {
    const conversations = [
      { id: "c1", title: "Projet Alpha" },
      { id: "c2", title: "Compte-rendu réunion" },
    ];
    const items = filterSearchItems({
      query: "",
      conversations,
      remote: null,
      remoteDocs: null,
      lang: "fr",
      labels,
    });

    expect(items[0]).toEqual({ id: "new", href: "/fr/app", title: "Nouvelle discussion", kind: "new" });
    expect(items.slice(1)).toHaveLength(2);
    expect(items[1].title).toBe("Projet Alpha");
  });

  it("filtre localement les conversations par titre lorsque l'utilisateur saisit un terme", () => {
    const conversations = [
      { id: "c1", title: "Projet Alpha" },
      { id: "c2", title: "Compte-rendu réunion" },
    ];
    const items = filterSearchItems({
      query: "réunion",
      conversations,
      remote: null,
      remoteDocs: null,
      lang: "fr",
      labels,
    });

    expect(items.some((i) => i.kind === "new")).toBe(false);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("c2");
    expect(items[0].title).toBe("Compte-rendu réunion");
  });

  it("combine les résultats distants de messages et de documents", () => {
    const conversations = [{ id: "c1", title: "Discussion 1" }];
    const remote = {
      query: "rapport",
      hits: [
        {
          conversation_id: "c2",
          title: "Discussion 2",
          created_at: null,
          matched_in: "message" as const,
          snippet: "Voir le rapport financier",
        },
      ],
    };
    const remoteDocs = {
      query: "rapport",
      result: {
        hits: [
          {
            doc_id: "d1",
            original_name: "Rapport2026.pdf",
            project_id: "p1",
            project_name: "Finance",
            conversation_id: null,
            conversation_title: null,
            excerpt: "Bilan annuel",
            file_url: "sandbox:doc/Rapport2026.pdf",
            score: 0.95,
            matched_in: "content" as const,
          },
        ],
        mode: "hybrid" as const,
        warning: null,
      },
    };

    const items = filterSearchItems({
      query: "rapport",
      conversations,
      remote,
      remoteDocs,
      lang: "fr",
      labels,
    });

    const msgItem = items.find((i) => i.kind === "message");
    const docItem = items.find((i) => i.kind === "document");

    expect(msgItem).toBeDefined();
    expect(msgItem?.title).toBe("Discussion 2");
    expect(msgItem?.snippet).toBe("Voir le rapport financier");

    expect(docItem).toBeDefined();
    expect(docItem?.title).toBe("Rapport2026.pdf");
    expect(docItem?.origin).toBe("Projet Finance");
  });
});
