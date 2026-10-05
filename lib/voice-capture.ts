// Capture du micro pour le mode vocal : des échantillons bruts (AudioWorklet) → niveau → détection de la parole (lib/voice.ts) → un WAV
// 16 kHz par phrase. Rien n'est enregistré ni envoyé tant que personne ne parle ; le micro ne sert qu'ici, et `stop()` ferme tout.

import { createVad, DEFAULT_VAD, downsample, encodeWav, TARGET_RATE, toDb, type Vad, type VadEvent } from "./voice";

const CHUNK = 2048; // échantillons par paquet remis par le worklet (~43 ms à 48 kHz)
const PRE_ROLL_MS = 450; // ce qui précède la détection : le début d'un mot ne doit pas être coupé
const TRIM_TAIL_MS = 350; // le silence qui clôt la phrase est coupé (on en garde un peu)

// Le module du worklet est inline (Blob) : pas de fichier public à servir, rien à mettre en cache hors ligne.
const WORKLET = `
class DonnaTap extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(${CHUNK}); this.length = 0; }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.length++] = channel[i];
      if (this.length === ${CHUNK}) { this.port.postMessage(this.buffer.slice(0)); this.length = 0; }
    }
    return true;
  }
}
registerProcessor("donna-tap", DonnaTap);
`;

export type CaptureHandlers = {
  onVad: (event: VadEvent) => void;
  /** Niveau du micro en dBFS, ~10 fois par seconde. */
  onLevel: (db: number) => void;
  /** Une phrase complète, déjà en WAV 16 kHz mono. */
  onUtterance: (wav: Blob, speechMs: number) => void;
  /** Le micro a disparu (débranché, permission retirée). */
  onLost: () => void;
};

export class MicError extends Error {
  constructor(readonly kind: "permission" | "noMic" | "unsupported") {
    super(kind);
  }
}

export class VoiceCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private url: string | null = null;
  private readonly vad: Vad = createVad(DEFAULT_VAD);
  private ring: Float32Array[] = [];
  private utterance: Float32Array[] | null = null;
  private strict = false;
  private muted = false;
  private lastLevelAt = 0;
  private rate = 48_000;

  constructor(private readonly handlers: CaptureHandlers) {}

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") throw new MicError("unsupported");
    try {
      // L'annulation d'écho du navigateur est ce qui permet de couper DONNA sans que sa propre voix ne se coupe elle-même.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (error) {
      const name = (error as DOMException).name;
      throw new MicError(name === "NotFoundError" || name === "OverconstrainedError" ? "noMic" : "permission");
    }
    const track = this.stream.getAudioTracks()[0];
    track?.addEventListener("ended", () => this.handlers.onLost());
    this.context = new AudioContext({ latencyHint: "interactive" });
    this.rate = this.context.sampleRate;
    this.url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await this.context.audioWorklet.addModule(this.url);
    await this.context.resume();
    this.node = new AudioWorkletNode(this.context, "donna-tap", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    this.node.port.onmessage = (message: MessageEvent<Float32Array>) => this.onChunk(message.data);
    const silence = this.context.createGain();
    silence.gain.value = 0; // le worklet doit être « tiré » par la sortie pour tourner ; on n'entend rien
    this.context.createMediaStreamSource(this.stream).connect(this.node).connect(silence).connect(this.context.destination);
  }

  setStrict(strict: boolean): void {
    this.strict = strict;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((track) => (track.enabled = !muted));
    if (muted) {
      this.vad.reset();
      this.utterance = null;
    }
  }

  stop(): void {
    this.node?.port.close();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close().catch(() => undefined);
    if (this.url) URL.revokeObjectURL(this.url);
    this.stream = this.context = this.node = this.url = null;
    this.ring = [];
    this.utterance = null;
    this.vad.reset();
  }

  private onChunk(chunk: Float32Array): void {
    let sum = 0;
    for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
    const db = toDb(Math.sqrt(sum / chunk.length));
    const now = performance.now();
    if (now - this.lastLevelAt > 90) {
      this.lastLevelAt = now;
      this.handlers.onLevel(this.muted ? -90 : db);
    }
    if (this.muted) return;

    const frameMs = (chunk.length / this.rate) * 1000;
    const event = this.vad.push(db, frameMs, this.strict);
    if (this.utterance) this.utterance.push(chunk);
    else {
      this.ring.push(chunk);
      const keep = Math.ceil(PRE_ROLL_MS / frameMs);
      if (this.ring.length > keep) this.ring.splice(0, this.ring.length - keep);
    }
    if (!event) return;
    if (event.type === "start") {
      this.utterance = [...this.ring, ...(this.utterance ?? [])];
      this.ring = [];
    } else {
      const frames = this.utterance ?? [];
      this.utterance = null;
      if (event.type === "end") this.deliver(frames, frameMs, event.speechMs);
    }
    this.handlers.onVad(event);
  }

  private deliver(frames: Float32Array[], frameMs: number, speechMs: number): void {
    const drop = Math.max(0, Math.floor((DEFAULT_VAD.endSilenceMs - TRIM_TAIL_MS) / frameMs));
    const kept = frames.slice(0, Math.max(1, frames.length - drop));
    const samples = new Float32Array(kept.reduce((total, frame) => total + frame.length, 0));
    let offset = 0;
    for (const frame of kept) {
      samples.set(frame, offset);
      offset += frame.length;
    }
    const wav = encodeWav(downsample(samples, this.rate, TARGET_RATE), Math.min(this.rate, TARGET_RATE));
    this.handlers.onUtterance(new Blob([wav as BlobPart], { type: "audio/wav" }), speechMs);
  }
}
