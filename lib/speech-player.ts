// Lecture de la réponse de DONNA, phrase par phrase : chaque morceau part à /speech (Piper, en local), les suivants sont préparés pendant
// que le précédent joue, et `cancel()` coupe tout sur-le-champ (reprise de parole de l'utilisateur). Web Audio plutôt qu'un <audio> :
// pas de latence de démarrage, et un arrêt immédiat.

const MAX_AHEAD = 2; // morceaux préparés d'avance
const FAILURES_BEFORE_GIVING_UP = 2;

export type PlayerHandlers = {
  /** Le premier son de la réponse démarre. */
  onStart: () => void;
  /** Tout ce qui était à lire a été lu (après `finish()`). */
  onIdle: () => void;
  /** La voix ne répond plus : la réponse reste affichée, on ne la lit plus. */
  onUnavailable: () => void;
};

type Item = { text: string; buffer: Promise<AudioBuffer | null> | null; controller: AbortController | null };

export class SpeechPlayer {
  private context: AudioContext | null = null;
  private queue: Item[] = [];
  private current: AudioBufferSourceNode | null = null;
  private playing = false;
  private finished = false;
  private started = false;
  private failures = 0;
  private disabled = false;
  private generation = 0;

  constructor(private readonly handlers: PlayerHandlers, private readonly endpoint = "/api/donna/chat/speech") {}

  /** À appeler dans un geste de l'utilisateur (le lancement du mode vocal) : le navigateur n'autorise le son qu'après. */
  async prepare(): Promise<void> {
    this.context ??= new AudioContext({ latencyHint: "interactive" });
    await this.context.resume();
  }

  get active(): boolean {
    return this.queue.length > 0 || this.playing;
  }

  enqueue(text: string): void {
    if (this.disabled || !text.trim()) return;
    this.queue.push({ text, buffer: null, controller: null });
    this.prefetch();
    void this.pump();
  }

  /** Plus rien n'arrivera pour cette réponse : `onIdle` part quand la file est vidée. */
  finish(): void {
    this.finished = true;
    this.settle();
  }

  /** Coupe la lecture et oublie ce qui restait. Prêt pour une nouvelle réponse. */
  cancel(): void {
    this.generation++;
    for (const item of this.queue) item.controller?.abort();
    this.queue = [];
    try {
      this.current?.stop();
    } catch {
      // déjà arrêtée
    }
    this.current = null;
    this.playing = false;
    this.finished = false;
    this.started = false;
  }

  /** Nouvelle réponse : on repart d'un état propre (sans oublier qu'une voix HS le reste pour la session). */
  reset(): void {
    this.cancel();
  }

  dispose(): void {
    this.cancel();
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }

  private prefetch(): void {
    let ahead = 0;
    for (const item of this.queue) {
      if (item.buffer) {
        ahead++;
        continue;
      }
      if (ahead >= MAX_AHEAD) break;
      item.controller = new AbortController();
      item.buffer = this.synthesize(item.text, item.controller.signal);
      ahead++;
    }
  }

  private async synthesize(text: string, signal: AbortSignal): Promise<AudioBuffer | null> {
    const generation = this.generation;
    try {
      const response = await fetch(this.endpoint, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal,
      });
      if (!response.ok) throw new Error(String(response.status));
      const bytes = await response.arrayBuffer();
      if (generation !== this.generation || !this.context) return null;
      const buffer = await this.context.decodeAudioData(bytes);
      this.failures = 0;
      return buffer;
    } catch {
      if (signal.aborted || generation !== this.generation) return null;
      if (++this.failures >= FAILURES_BEFORE_GIVING_UP && !this.disabled) {
        this.disabled = true;
        this.handlers.onUnavailable();
      }
      return null;
    }
  }

  private async pump(): Promise<void> {
    if (this.playing) return;
    const generation = this.generation;
    this.playing = true;
    while (generation === this.generation) {
      const item = this.queue.shift();
      if (!item) break;
      this.prefetch();
      const buffer = await (item.buffer ?? this.synthesize(item.text, new AbortController().signal));
      if (generation !== this.generation) return;
      if (!buffer || !this.context) continue; // une phrase qui n'a pas pu être lue : on passe à la suivante
      await new Promise<void>((resolve) => {
        const source = this.context!.createBufferSource();
        source.buffer = buffer;
        source.connect(this.context!.destination);
        source.onended = () => resolve();
        this.current = source;
        if (!this.started) {
          this.started = true;
          this.handlers.onStart();
        }
        source.start();
      });
      if (generation === this.generation) this.current = null;
    }
    if (generation !== this.generation) return;
    this.playing = false;
    this.settle();
  }

  private settle(): void {
    if (this.finished && !this.playing && this.queue.length === 0) {
      this.finished = false;
      this.started = false;
      this.handlers.onIdle();
    }
  }
}
