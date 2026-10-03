import { afterEach, describe, expect, it, vi } from "vitest";
import { nextFeedback, REASON_MAX, sendFeedback } from "./feedback";

afterEach(() => vi.unstubAllGlobals());

describe("nextFeedback", () => {
  it("un second clic sur le même pouce le retire, l'autre pouce le remplace", () => {
    expect(nextFeedback(null, "up")).toBe("up");
    expect(nextFeedback(undefined, "down")).toBe("down");
    expect(nextFeedback("up", "up")).toBeNull();
    expect(nextFeedback("up", "down")).toBe("down");
    expect(nextFeedback("down", "up")).toBe("up");
  });
});

describe("sendFeedback", () => {
  it("envoie le retour au bon endroit, avec l'identifiant encodé", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendFeedback("a/b c", "down", "  faux  ")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/donna/chat/messages/a%2Fb%20c/feedback");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ rating: "down", reason: "faux" });
  });

  it("retire le retour avec rating null et sans commentaire vide", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await sendFeedback("m1", null, "   ");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ rating: null, reason: null });
  });

  it("borne le commentaire à la limite du serveur", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await sendFeedback("m1", "down", "x".repeat(REASON_MAX + 100));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reason).toHaveLength(REASON_MAX);
  });

  it("renvoie false sur un refus ou une panne réseau, sans lever", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await sendFeedback("m1", "up")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("réseau")));
    expect(await sendFeedback("m1", "up")).toBe(false);
  });
});
