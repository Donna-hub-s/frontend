import { afterEach, describe, expect, it, vi } from "vitest";
import { nextSiblings, selectMessageBranch } from "./branches";

afterEach(() => vi.unstubAllGlobals());

describe("selectMessageBranch", () => {
  it("appelle la bonne route, avec les identifiants encodés", async () => {
    const messages = [{ id: "m1", role: "user", content: "x", created_at: null, attachments: [] }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => messages });
    vi.stubGlobal("fetch", fetchMock);
    expect(await selectMessageBranch("c/1", "m 2")).toEqual(messages);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/donna/chat/c%2F1/messages/m%202/select");
    expect(init.method).toBe("POST");
  });

  it("renvoie null sur un refus ou une panne réseau, sans lever", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await selectMessageBranch("c1", "m1")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("réseau")));
    expect(await selectMessageBranch("c1", "m1")).toBeNull();
  });
});

describe("nextSiblings", () => {
  it("part de [ancien] quand aucune version n'était encore connue", () => {
    expect(nextSiblings(undefined, "old", "new")).toEqual({ siblingIds: ["old", "new"], siblingIndex: 1 });
    expect(nextSiblings([], "old", "new")).toEqual({ siblingIds: ["old", "new"], siblingIndex: 1 });
  });

  it("ajoute à la fin d'une liste de versions déjà connue", () => {
    expect(nextSiblings(["a", "b"], "b", "c")).toEqual({ siblingIds: ["a", "b", "c"], siblingIndex: 2 });
  });
});
