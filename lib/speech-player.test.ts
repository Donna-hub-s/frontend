import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechPlayer, type PlayerHandlers } from "./speech-player";

describe("SpeechPlayer", () => {
  let handlers: PlayerHandlers;
  let player: SpeechPlayer;
  const fetchMock = vi.fn();

  beforeEach(() => {
    handlers = {
      onStart: vi.fn(),
      onIdle: vi.fn(),
      onUnavailable: vi.fn(),
    };
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);

    // Mock AudioContext and AudioBuffer
    const mockAudioContext = vi.fn().mockImplementation(() => ({
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      decodeAudioData: vi.fn().mockResolvedValue({ duration: 1 }),
      createBufferSource: vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(function (this: { onended?: () => void }) {
          setTimeout(() => this.onended?.(), 10);
        }),
      }),
      destination: {},
    }));

    vi.stubGlobal("AudioContext", mockAudioContext);

    player = new SpeechPlayer(handlers);
  });

  afterEach(() => {
    player.dispose();
    vi.unstubAllGlobals();
  });

  it("initializes with active = false", () => {
    expect(player.active).toBe(false);
  });

  it("prepare creates and resumes AudioContext", async () => {
    await player.prepare();
    expect(AudioContext).toHaveBeenCalled();
  });

  it("enqueue adds items and starts synthesis", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });

    await player.prepare();
    player.enqueue("Bonjour DONNA");

    expect(player.active).toBe(true);

    // Wait for async pump
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/donna/chat/speech",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Bonjour DONNA" }),
      })
    );
    expect(handlers.onStart).toHaveBeenCalled();
  });

  it("finish triggers onIdle when queue empties", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });

    await player.prepare();
    player.enqueue("Phrase unique");
    player.finish();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handlers.onIdle).toHaveBeenCalled();
  });

  it("cancel resets state and stops playback", () => {
    player.enqueue("Phrase 1");
    player.cancel();

    expect(player.active).toBe(false);
  });

  it("notifies onUnavailable after repeated synthesis failures", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await player.prepare();
    player.enqueue("Failed 1");
    player.enqueue("Failed 2");

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(handlers.onUnavailable).toHaveBeenCalled();
  });
});
