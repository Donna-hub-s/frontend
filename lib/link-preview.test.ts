import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLinkPreview } from "./link-preview";

afterEach(() => vi.unstubAllGlobals());

describe("fetchLinkPreview", () => {
  it("appelle la bonne route, avec la conversation et l'URL encodées", async () => {
    const data = { title: "Example", excerpt: "Un exemple.", url: "https://example.com/" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLinkPreview("c/1", "https://example.com?x=1");
    expect(result).toEqual({ ok: true, data });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/donna/chat/c%2F1/link-preview?url=https%3A%2F%2Fexample.com%3Fx%3D1");
  });

  it("renvoie la raison du serveur sur un refus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: "Le site a répondu 404." }) }),
    );
    expect(await fetchLinkPreview("c1", "https://example.com")).toEqual({ ok: false, message: "Le site a répondu 404." });
  });

  it("renvoie un message null si le corps n'est pas lisible ou sans detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error("pas du json"); } }));
    expect(await fetchLinkPreview("c1", "https://example.com")).toEqual({ ok: false, message: null });
  });

  it("renvoie un message null sur une panne réseau, sans lever", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("réseau")));
    expect(await fetchLinkPreview("c1", "https://example.com")).toEqual({ ok: false, message: null });
  });
});
