// Session du mode vocal : UNE par onglet, hors de React. Quand la première phrase d'une nouvelle conversation la crée, l'URL bascule sur
// /c/<id> et la route remonte le composant de conversation : si le micro et la lecture vivaient dans ce composant, le mode vocal
// s'arrêterait au beau milieu de la première réponse. La session survit donc au démontage — `release()` ne l'arrête qu'après un court
// délai de grâce, et un composant qui se remonte aussitôt la reprend (`bind`).
//
// Ce que le mode vocal NE change PAS : un message dit est un message écrit (même route, mêmes outils, mêmes droits) ; rien n'est approuvé
// à la voix — une action proposée attend, comme toujours, le clic de l'utilisateur ; l'audio n'est jamais conservé (transcrit en mémoire,
// voir /transcribe). Le micro n'est ouvert que tant que le mode est actif, et l'interface le dit en permanence.

import { SpeechPlayer, type PlayerHandlers } from "./speech-player";
import { MicError, VoiceCapture, type CaptureHandlers } from "./voice-capture";
import { takeSpeech, voiceOff, voiceReducer, type VoiceEvent, type VoiceState, type VoiceTurn } from "./voice";

const INACTIVITY_MS = 3 * 60_000;
const GRACE_MS = 1500;

export type { VoiceTurn };

/** Ce que la session utilise du micro et de la lecture : de quoi les remplacer par des doublures dans les tests. */
export type PlayerLike = Pick<SpeechPlayer, "prepare" | "enqueue" | "finish" | "cancel" | "dispose" | "active">;
export type CaptureLike = Pick<VoiceCapture, "start" | "stop" | "setMuted" | "setStrict">;
export type SessionParts = {
  player: (handlers: PlayerHandlers) => PlayerLike;
  capture: (handlers: CaptureHandlers) => CaptureLike;
};

const realParts: SessionParts = {
  player: (handlers) => new SpeechPlayer(handlers),
  capture: (handlers) => new VoiceCapture(handlers),
};

export type SessionOptions = {
  lang: "fr" | "en";
  /** Envoie ce que la personne a dit comme message ; rend le nombre de messages AVANT l'envoi (repère de la réponse à lire), ou null si rien n'est parti. */
  onUtterance: (text: string) => number | null;
  /** Arrête la génération en cours. */
  onInterrupt: () => void;
};

type Listener = () => void;

export class VoiceSession {
  private state: VoiceState = voiceOff;
  private level = 0;
  private marker: number | null = null;
  private options: SessionOptions | null = null;
  private capture: CaptureLike | null = null;
  private player: PlayerLike | null = null;
  private alive = false;
  private held = ""; // texte entendu, pas encore envoyé (la personne peut continuer sa phrase)
  // Lus de façon SYNCHRONE (l'état se met à jour dans l'événement suivant) : on parle en ce moment ? combien de transcriptions sont en vol ?
  private hearing = false;
  private pending = 0;
  private spoken: { turnId: string | null; next: number } = { turnId: null, next: 0 };
  private inactivity: ReturnType<typeof setTimeout> | null = null;
  private grace: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly levelListeners = new Set<Listener>();

  constructor(private readonly parts: SessionParts = realParts) {}

  // ── Abonnement (useSyncExternalStore) ──────────────────────────────────────

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  subscribeLevel = (listener: Listener): (() => void) => {
    this.levelListeners.add(listener);
    return () => this.levelListeners.delete(listener);
  };
  getState = (): VoiceState => this.state;
  getLevel = (): number => this.level;
  getMarker = (): number | null => this.marker;

  private emit(event: VoiceEvent): void {
    const next = voiceReducer(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  private setLevel(level: number): void {
    this.level = level;
    this.levelListeners.forEach((listener) => listener());
  }

  // ── Le composant se (re)monte ou part ──────────────────────────────────────

  bind(options: SessionOptions): void {
    this.options = options;
    if (this.grace) clearTimeout(this.grace);
    this.grace = null;
  }

  /** Le composant qui portait la session disparaît : on l'arrête, sauf si un autre la reprend dans l'instant (création de la conversation). */
  release(): void {
    if (!this.alive) return;
    if (this.grace) clearTimeout(this.grace);
    this.grace = setTimeout(() => this.stop(), GRACE_MS);
  }

  // ── Cycle de vie ───────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.alive || !this.options) return;
    this.alive = true;
    this.marker = null;
    this.emit({ type: "begin" });
    // Préchauffage des modèles (Whisper, voix) : la première phrase n'attend pas leur chargement. Sans conséquence si ça échoue.
    void fetch("/api/donna/chat/voice/warmup", { method: "POST" }).catch(() => undefined);

    const player = this.parts.player({
      onStart: () => {
        // Sa voix peut revenir dans le micro : tant qu'elle parle, la couper exige une voix franche (voir lib/voice.ts, STRICT).
        this.capture?.setStrict(true);
        this.emit({ type: "speakStart" });
      },
      onIdle: () => {
        this.capture?.setStrict(false);
        this.emit({ type: "turnOver" });
        this.arm();
      },
      onUnavailable: () => this.emit({ type: "notice", notice: "ttsDown" }),
    });
    this.player = player;
    const capture = this.parts.capture({
      onVad: (event) => {
        if (event.type === "start") {
          this.arm();
          this.hearing = true;
          // Reprendre la parole pendant que DONNA réfléchit ou lit : on coupe sa lecture ET sa génération.
          if (this.state.phase === "speaking" || this.state.phase === "thinking") {
            player.cancel();
            this.capture?.setStrict(false);
            this.options?.onInterrupt();
          }
          this.emit({ type: "speechStart" });
        } else {
          this.hearing = false;
          this.emit({ type: "speechEnd", sent: event.type === "end" });
          if (event.type === "discard") this.flush(); // un bruit bref : ce qui attendait peut partir
        }
      },
      onLevel: (db) => this.setLevel(Math.max(0, Math.min(1, (db + 60) / 45))),
      onUtterance: (wav) => {
        this.pending += 1; // compté AVANT la fin de la parole (l'événement « end » suit) : rien n'est envoyé avant son texte
        void this.transcribe(wav);
      },
      onLost: () => {
        this.teardown();
        this.emit({ type: "micError", error: "micLost" });
      },
    });
    this.capture = capture;
    try {
      await player.prepare();
      await capture.start();
    } catch (error) {
      this.teardown();
      this.emit({ type: "micError", error: error instanceof MicError ? error.kind : "permission" });
      return;
    }
    if (!this.alive) return; // arrêtée pendant l'ouverture du micro
    this.emit({ type: "micReady" });
    this.arm();
  }

  stop(): void {
    if (this.state.phase === "off") return;
    this.options?.onInterrupt();
    this.teardown();
    this.emit({ type: "end" });
  }

  mute(muted: boolean): void {
    this.capture?.setMuted(muted);
    if (muted) this.hearing = false;
    this.emit({ type: "mute", muted });
  }

  /** Coupe la réponse en cours (lecture et génération) sans quitter le mode vocal. */
  interrupt(): void {
    this.player?.cancel();
    this.capture?.setStrict(false);
    this.options?.onInterrupt();
    this.emit({ type: "interrupt" });
  }

  private teardown(): void {
    this.alive = false;
    if (this.inactivity) clearTimeout(this.inactivity);
    if (this.grace) clearTimeout(this.grace);
    this.inactivity = this.grace = null;
    this.capture?.stop();
    this.capture = null;
    this.player?.dispose();
    this.player = null;
    this.held = "";
    this.hearing = false;
    this.pending = 0;
    this.spoken = { turnId: null, next: 0 };
    this.setLevel(0);
  }

  private arm(): void {
    if (this.inactivity) clearTimeout(this.inactivity);
    this.inactivity = setTimeout(() => {
      this.options?.onInterrupt();
      this.teardown();
      this.emit({ type: "end", notice: "inactive" });
    }, INACTIVITY_MS);
  }

  // ── Ce que la personne dit ─────────────────────────────────────────────────

  private async transcribe(wav: Blob): Promise<void> {
    let text = "";
    let failed = false;
    try {
      const form = new FormData();
      form.append("audio", wav, "utterance.wav");
      const response = await fetch(`/api/donna/chat/transcribe?mode=voice&lang=${this.options?.lang ?? "fr"}`, { method: "POST", body: form });
      if (!response.ok) throw new Error(String(response.status));
      text = ((await response.json()) as { text: string }).text.trim();
    } catch {
      failed = true;
    }
    this.pending = Math.max(0, this.pending - 1);
    if (!this.alive) return;
    if (text) this.held = this.held ? `${this.held} ${text}` : text;
    this.emit({ type: "transcribed", hold: Boolean(this.held), failed });
    this.flush();
  }

  /** Envoie le texte tenu en attente, s'il n'y a plus rien à attendre : plus personne ne parle, plus de transcription en cours. */
  private flush(): void {
    if (!this.alive || !this.held || this.hearing || this.pending > 0) return;
    const text = this.held.trim();
    this.held = "";
    if (!text) return;
    this.emit({ type: "submit", text });
    this.marker = this.options?.onUtterance(text) ?? null;
    this.spoken = { turnId: null, next: 0 };
    // Rien n'est parti (une réponse encore en cours, ou plus de conversation) : on ne reste pas à attendre une réponse qui ne viendra pas.
    if (this.marker === null) this.emit({ type: "turnOver" });
    this.arm();
  }

  // ── Ce que DONNA répond ────────────────────────────────────────────────────

  /** La réponse de DONNA au dernier énoncé, telle qu'elle arrive : on la lit phrase par phrase dès qu'une phrase est complète. */
  feed(turn: VoiceTurn): void {
    const player = this.player;
    if (!this.alive || !player || !turn) return;
    const phase = this.state.phase;
    if (phase !== "thinking" && phase !== "speaking") return; // pas de réponse attendue (coupée, ou pas la nôtre)
    if (turn.status === "stopped") return; // coupée : on ne lit pas ce qui reste
    if (this.spoken.turnId !== turn.id) this.spoken = { turnId: turn.id, next: 0 };
    const final = turn.status !== "streaming";
    const { chunks, next } = takeSpeech(turn.content, this.spoken.next, final);
    this.spoken.next = next;
    chunks.forEach((chunk) => player.enqueue(chunk));
    if (final) {
      player.finish();
      if (!player.active) {
        this.emit({ type: "turnOver" }); // rien à lire (réponse faite d'un fichier, d'un tableau, ou en erreur)
        this.arm();
      }
    }
  }
}

export const voiceSession = new VoiceSession();
