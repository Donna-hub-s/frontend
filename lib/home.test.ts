import { describe, expect, it } from "vitest";
import type { ConversationOut } from "./api";
import { isBareHome, MAX_RECENT, recentConversations } from "./home";

const conv = (id: string, updated?: string | null, created?: string | null): ConversationOut => ({
  id,
  title: id,
  created_at: created ?? null,
  ...(updated === undefined ? {} : { updated_at: updated ?? undefined }),
});

describe("conversations à reprendre", () => {
  it("met la plus récemment touchée en premier", () => {
    const list = [conv("vieille", "2026-01-01T00:00:00Z"), conv("fraiche", "2026-10-09T00:00:00Z"), conv("moyenne", "2026-06-01T00:00:00Z")];
    expect(recentConversations(list).map((c) => c.id)).toEqual(["fraiche", "moyenne", "vieille"]);
  });

  it("retombe sur la date de création quand updated_at manque (mise à jour optimiste locale)", () => {
    const list = [conv("sans-updated", undefined, "2026-10-09T00:00:00Z"), conv("avec-updated", "2026-05-01T00:00:00Z")];
    expect(recentConversations(list).map((c) => c.id)).toEqual(["sans-updated", "avec-updated"]);
  });

  it("une conversation sans aucune date passe en dernier, sans faire planter le tri", () => {
    const list = [conv("sans-date", undefined, null), conv("datee", "2026-01-01T00:00:00Z")];
    expect(recentConversations(list).map((c) => c.id)).toEqual(["datee", "sans-date"]);
  });

  it("ne dépasse jamais le plafond", () => {
    const list = Array.from({ length: 12 }, (_, i) => conv(`c${i}`, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
    expect(recentConversations(list)).toHaveLength(MAX_RECENT);
    expect(recentConversations(list, 2).map((c) => c.id)).toEqual(["c11", "c10"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const list = [conv("a", "2026-01-01T00:00:00Z"), conv("b", "2026-10-01T00:00:00Z")];
    const copie = [...list];
    recentConversations(list);
    expect(list).toEqual(copie);
  });

  it("supporte une liste vide", () => {
    expect(recentConversations([])).toEqual([]);
  });
});

describe("accueil d'un compte vide", () => {
  it("les raccourcis n'apparaissent QUE sans rien à valider ni à reprendre", () => {
    expect(isBareHome(0, 0)).toBe(true);
    expect(isBareHome(1, 0)).toBe(false);
    expect(isBareHome(0, 1)).toBe(false);
    expect(isBareHome(3, 7)).toBe(false);
  });
});
