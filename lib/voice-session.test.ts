import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceSession, type CaptureLike, type PlayerLike, type SessionOptions } from "./voice-session";
import type { CaptureHandlers } from "./voice-capture";
import type { PlayerHandlers } from "./speech-player";
import type { VoiceTurn, VoiceTurnStatus } from "./voice";

// La session sans micro ni haut-parleur : des doublures, pour vérifier ce qui compte — quand on coupe DONNA, ce qui part comme message,
// ce qu'on lit et quand on se rendort.

class FakePlayer implements PlayerLike {
  enqueued: string[] = [];
  finished = false;
  cancelled = 0;
  active = false;
  constructor(readonly handlers: PlayerHandlers) {}
  async prepare() {}
  enqueue(text: string) {
    this.enqueued.push(text);
    this.active = true;
  }
  finish() {
    this.finished = true;
  }
  cancel() {
    this.cancelled++;
    this.active = false;
    this.enqueued = [];
    this.finished = false;
  }
  dispose() {}
}

class FakeCapture implements CaptureLike {
  strict: boolean[] = [];
  stopped = false;
  constructor(readonly handlers: CaptureHandlers) {}
  async start() {}
  stop() {
    this.stopped = true;
  }
  setMuted() {}
  setStrict(value: boolean) {
    this.strict.push(value);
  }
}

function setup(onUtterance: SessionOptions["onUtterance"] = () => 0) {
  let player!: FakePlayer;
  let capture!: FakeCapture;
  const session = new VoiceSession({
    player: (handlers) => (player = new FakePlayer(handlers)),
    capture: (handlers) => (capture = new FakeCapture(handlers)),
  });
  const onInterrupt = vi.fn();
  const utterance = vi.fn(onUtterance);
  session.bind({ lang: "fr", onUtterance: utterance, onInterrupt });
  return { session, onInterrupt, utterance, player: () => player, capture: () => capture };
}

/** Une phrase dite : la détection commence, l'extrait part en transcription, la détection finit (dans cet ordre, comme la vraie capture). */
async function say(capture: FakeCapture) {
  capture.handlers.onVad({ type: "start" });
  capture.handlers.onUtterance(new Blob(["wav"], { type: "audio/wav" }), 1500);
  capture.handlers.onVad({ type: "end", speechMs: 1500, reason: "silence" });
}

const turn = (content: string, status: VoiceTurnStatus = "streaming"): VoiceTurn => ({
  id: "m1", content, status,
});

let transcript = "Bonjour Donna";

beforeEach(() => {
  transcript = "Bonjour Donna";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/transcribe")) return new Response(JSON.stringify({ text: transcript }), { status: 200 });
      return new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("session du mode vocal", () => {
  it("ouvre le micro, écoute, puis envoie ce qui a été dit comme message", async () => {
    const { session, utterance, capture } = setup(() => 4);
    await session.start();
    expect(session.getState().phase).toBe("listening");

    await say(capture());
    await vi.waitFor(() => expect(utterance).toHaveBeenCalledWith("Bonjour Donna"));
    expect(session.getState().phase).toBe("thinking");
    expect(session.getMarker()).toBe(4); // le nombre de messages AVANT l'envoi : repère de la réponse à lire
  });

  it("lit la réponse phrase par phrase pendant qu'elle arrive, sans relire ce qui l'a déjà été", async () => {
    const { session, player, capture } = setup();
    await session.start();
    await say(capture());
    await vi.waitFor(() => expect(session.getState().phase).toBe("thinking"));

    session.feed(turn("Bonjour, je suis là pour vous aider aujourd'hui. Que souhaitez-vous faire de cette"));
    expect(player().enqueued).toEqual(["Bonjour, je suis là pour vous aider aujourd'hui."]);

    session.feed(turn("Bonjour, je suis là pour vous aider aujourd'hui. Que souhaitez-vous faire de cette journée ? Dites-moi tout."));
    expect(player().enqueued).toEqual(["Bonjour, je suis là pour vous aider aujourd'hui.", "Que souhaitez-vous faire de cette journée ?"]);

    session.feed(turn("Bonjour, je suis là pour vous aider aujourd'hui. Que souhaitez-vous faire de cette journée ? Dites-moi tout.", "done"));
    expect(player().enqueued.at(-1)).toBe("Dites-moi tout.");
    expect(player().finished).toBe(true);
  });

  it("durcit la détection pendant que DONNA parle, et la relâche quand elle a fini", async () => {
    const { session, player, capture } = setup();
    await session.start();
    await say(capture());
    await vi.waitFor(() => expect(session.getState().phase).toBe("thinking"));

    player().handlers.onStart();
    expect(session.getState().phase).toBe("speaking");
    expect(capture().strict).toEqual([true]);

    player().handlers.onIdle();
    expect(capture().strict).toEqual([true, false]);
    expect(session.getState().phase).toBe("listening");
  });

  it("reprendre la parole pendant que DONNA lit coupe sa lecture ET sa génération", async () => {
    const { session, onInterrupt, player, capture } = setup();
    await session.start();
    await say(capture());
    await vi.waitFor(() => expect(session.getState().phase).toBe("thinking"));
    session.feed(turn("Voici une première phrase assez longue pour être lue. Et une seconde"));
    player().handlers.onStart();

    capture().handlers.onVad({ type: "start" });
    expect(player().cancelled).toBe(1);
    expect(onInterrupt).toHaveBeenCalledTimes(1);
    expect(capture().strict.at(-1)).toBe(false);
    expect(session.getState().phase).toBe("hearing");

    // Ce qui reste de la réponse coupée n'est plus lu.
    session.feed(turn("Voici une première phrase assez longue pour être lue. Et une seconde phrase.", "stopped"));
    expect(player().enqueued).toEqual([]);
  });

  it("reprendre la parole pendant que DONNA réfléchit (avant tout son) coupe aussi la génération", async () => {
    const { session, onInterrupt, player, capture } = setup();
    await session.start();
    await say(capture());
    await vi.waitFor(() => expect(session.getState().phase).toBe("thinking"));

    capture().handlers.onVad({ type: "start" });
    expect(player().cancelled).toBe(1);
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it("parler pendant qu'on écoute n'interrompt rien", async () => {
    const { session, onInterrupt, player, capture } = setup();
    await session.start();
    capture().handlers.onVad({ type: "start" });
    expect(player().cancelled).toBe(0);
    expect(onInterrupt).not.toHaveBeenCalled();
  });

  it("ne reste pas à attendre une réponse quand rien n'est parti (réponse précédente encore en cours)", async () => {
    const { session, capture } = setup(() => null);
    await session.start();
    await say(capture());
    await vi.waitFor(() => expect(session.getMarker()).toBeNull());
    await vi.waitFor(() => expect(session.getState().phase).toBe("listening"));
  });

  it("une transcription vide ne part pas comme message", async () => {
    transcript = "";
    const { session, utterance, capture } = setup();
    await session.start();
    await say(capture());
    await vi.waitFor(() => expect(session.getState().notice).toBe("noSpeech"));
    expect(utterance).not.toHaveBeenCalled();
    expect(session.getState().phase).toBe("listening");
  });

  it("une réponse sans rien à dire (réponse en erreur) rend la main sans bruit", async () => {
    const { session, player, capture } = setup();
    await session.start();
    await say(capture());
    await vi.waitFor(() => expect(session.getState().phase).toBe("thinking"));
    session.feed(turn("", "error"));
    expect(player().enqueued).toEqual([]);
    expect(session.getState().phase).toBe("listening");
  });

  it("terminer le mode vocal ferme le micro et coupe la génération", async () => {
    const { session, onInterrupt, capture } = setup();
    await session.start();
    session.stop();
    expect(capture().stopped).toBe(true);
    expect(onInterrupt).toHaveBeenCalled();
    expect(session.getState().phase).toBe("off");
  });

  it("s'arrête seul après trois minutes sans parole, et le dit", async () => {
    vi.useFakeTimers();
    const { session, capture } = setup();
    await session.start();
    vi.advanceTimersByTime(3 * 60_000 + 10);
    expect(capture().stopped).toBe(true);
    expect(session.getState()).toMatchObject({ phase: "off", notice: "inactive" });
  });

  it("le composant qui part n'arrête pas la session tout de suite (la conversation vient d'être créée), mais s'il ne revient pas, si", async () => {
    vi.useFakeTimers();
    const { session, capture } = setup();
    await session.start();

    session.release();
    session.bind({ lang: "fr", onUtterance: () => 0, onInterrupt: () => undefined }); // le composant remonte aussitôt
    vi.advanceTimersByTime(5_000);
    expect(session.getState().phase).toBe("listening");

    session.release(); // cette fois personne ne reprend
    vi.advanceTimersByTime(5_000);
    expect(capture().stopped).toBe(true);
    expect(session.getState().phase).toBe("off");
  });

  it("un micro refusé laisse l'erreur affichée, sans rien ouvrir", async () => {
    const session = new VoiceSession({
      player: (handlers) => new FakePlayer(handlers),
      capture: (handlers) => {
        const capture = new FakeCapture(handlers);
        capture.start = async () => {
          throw new (await import("./voice-capture")).MicError("permission");
        };
        return capture;
      },
    });
    session.bind({ lang: "fr", onUtterance: () => 0, onInterrupt: () => undefined });
    await session.start();
    expect(session.getState()).toMatchObject({ phase: "error", error: "permission" });
  });
});
