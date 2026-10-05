// Mode vocal : tout ce qui se teste sans micro ni navigateur — détection de la parole, découpage de la réponse en phrases à lire,
// texte « lisible à voix haute », encodage WAV, et l'automate des phases (écoute, transcription, réponse, lecture, coupure).

// ── Détection de la parole (VAD) ─────────────────────────────────────────────

export type VadConfig = {
  /** Seuil absolu minimal (dBFS) : en dessous, on ne croit jamais à de la parole. */
  minDb: number;
  /** Marge au-dessus du bruit de fond mesuré pour compter une trame comme de la parole. */
  marginDb: number;
  /** Une fois la parole commencée, on ne la croit finie que sous (seuil − hystérésis) : une syllabe faible ne coupe pas la phrase. */
  hysteresisDb: number;
  /** Durée de parole continue avant de dire « il parle ». */
  startMs: number;
  /** Silence qui clôt une phrase. */
  endSilenceMs: number;
  /** En dessous, c'est un bruit (toux, clic) : l'extrait est jeté. */
  minSpeechMs: number;
  /** Une phrase plus longue est coupée là (borne d'envoi). */
  maxSpeechMs: number;
  /** Au démarrage, on mesure le bruit de la pièce avant d'écouter : sinon un ventilateur serait pris pour une voix. */
  calibrationMs: number;
};

export const DEFAULT_VAD: VadConfig = {
  minDb: -50, marginDb: 11, hysteresisDb: 3, startMs: 120, endSilenceMs: 1100, minSpeechMs: 350, maxSpeechMs: 30_000, calibrationMs: 600,
};

/** Pendant que DONNA parle, son propre son peut revenir dans le micro : couper sa parole exige une voix franche (bien au-dessus du bruit) et plus longue. */
const STRICT = { marginDb: 22, startMs: 320 };

export type VadEvent =
  | { type: "start" }
  | { type: "end"; speechMs: number; reason: "silence" | "max" }
  | { type: "discard"; speechMs: number };

export const toDb = (rms: number): number => 20 * Math.log10(Math.max(rms, 1e-9));

export type Vad = {
  push: (db: number, frameMs: number, strict?: boolean) => VadEvent | null;
  reset: () => void;
  readonly speaking: boolean;
  readonly floorDb: number;
};

export function createVad(config: VadConfig = DEFAULT_VAD): Vad {
  let floor = -62; // bruit de fond estimé (dBFS), mis à jour hors parole
  let speaking = false;
  let loudMs = 0;
  let quietMs = 0;
  let speechMs = 0;
  let calibratedMs = 0;
  let calibrationSum = 0;

  const threshold = (strict: boolean) => Math.max(config.minDb, floor + (strict ? STRICT.marginDb : config.marginDb));

  return {
    get speaking() {
      return speaking;
    },
    get floorDb() {
      return floor;
    },
    reset() {
      speaking = false;
      loudMs = quietMs = speechMs = 0;
    },
    push(db, frameMs, strict = false) {
      if (calibratedMs < config.calibrationMs) {
        // Mesure du bruit de la pièce : rien n'est détecté pendant ce court instant (le micro vient de s'ouvrir).
        calibratedMs += frameMs;
        calibrationSum += db * frameMs;
        floor = Math.min(-35, Math.max(-80, calibrationSum / calibratedMs));
        return null;
      }
      const limit = threshold(strict);
      if (!speaking) {
        if (db > limit) {
          loudMs += frameMs;
          const needed = strict ? Math.max(config.startMs, STRICT.startMs) : config.startMs;
          if (loudMs >= needed) {
            speaking = true;
            speechMs = loudMs;
            quietMs = 0;
            return { type: "start" };
          }
          return null;
        }
        loudMs = 0;
        // Le bruit de fond suit lentement le niveau ambiant : il descend vite (une pièce qui se calme), monte doucement.
        floor += (db - floor) * (db < floor ? 0.2 : 0.02);
        floor = Math.min(-35, Math.max(-80, floor));
        return null;
      }
      speechMs += frameMs;
      if (db < limit - config.hysteresisDb) quietMs += frameMs;
      else quietMs = 0;
      if (speechMs >= config.maxSpeechMs) {
        const ms = speechMs;
        speaking = false;
        loudMs = quietMs = speechMs = 0;
        return { type: "end", speechMs: ms, reason: "max" };
      }
      if (quietMs >= config.endSilenceMs) {
        const spoken = speechMs - quietMs;
        speaking = false;
        loudMs = quietMs = speechMs = 0;
        return spoken >= config.minSpeechMs ? { type: "end", speechMs: spoken, reason: "silence" } : { type: "discard", speechMs: spoken };
      }
      return null;
    },
  };
}

// ── Audio → WAV 16 kHz mono (ce que reçoit /transcribe) ──────────────────────

export const TARGET_RATE = 16_000;

/** Rééchantillonne en moyennant les échantillons de chaque fenêtre (suffisant pour la parole ; évite le repliement le plus gros). */
export function downsample(input: Float32Array, fromRate: number, toRate = TARGET_RATE): Float32Array {
  if (toRate >= fromRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // taille du bloc fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // octets par seconde
  view.setUint16(32, 2, true); // octets par trame
  view.setUint16(34, 16, true); // bits par échantillon
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
  });
  return bytes;
}

// ── Réponse écrite → phrases à lire ──────────────────────────────────────────

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ABBREVIATIONS = new Set(["m", "mme", "mlle", "mr", "dr", "pr", "st", "ste", "etc", "cf", "env", "approx", "vs", "no", "n°", "fig", "p", "pp", "ex", "art", "tel", "mrs", "ms", "jr", "sr", "inc", "ltd", "co"]);
const EMOJI = /\p{Extended_Pictographic}/gu;

/** Texte écrit (Markdown) → texte qu'on peut lire à voix haute : sans balisage, sans code, sans tableau, sans adresse. */
export function toSpeakable(markdown: string): string {
  const lines: string[] = [];
  let fence: string | null = null;
  for (const raw of markdown.split("\n")) {
    const match = FENCE.exec(raw);
    if (fence === null && match) {
      fence = match[1][0];
      continue;
    }
    if (fence !== null) {
      if (match && match[1][0] === fence) fence = null;
      continue; // le code n'est pas lu
    }
    if (/^\s*\|.*\|\s*$/.test(raw) || /^\s*[-:| ]{3,}\s*$/.test(raw)) continue; // tableau, filet
    lines.push(
      raw
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
        .replace(/^\s*>\s?/, ""),
    );
  }
  return lines
    .join("\n")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(EMOJI, "")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** La réponse de DONNA à lire à voix haute, telle qu'elle se construit dans le fil. */
export type VoiceTurnStatus = "streaming" | "done" | "stopped" | "error" | undefined;
export type VoiceTurn = { id: string; content: string; status: VoiceTurnStatus } | null;

/**
 * La réponse à lire : la première réponse de DONNA qui suit le dernier énoncé envoyé. `marker` : le nombre de messages du fil AVANT cet
 * envoi (l'énoncé est donc à cet indice, sa réponse après lui). Une réponse plus ancienne n'est jamais relue : sans repère (`null`),
 * rien n'est à lire.
 */
export function voiceTurnOf(
  messages: readonly { id: string; role: string; content: string; status?: VoiceTurnStatus }[],
  marker: number | null,
): VoiceTurn {
  if (marker === null) return null;
  const reply = messages.slice(marker + 1).find((message) => message.role === "assistant");
  return reply ? { id: reply.id, content: reply.content, status: reply.status } : null;
}

export type SpeechChunks = { chunks: string[]; next: number };

const MIN_CHUNK = 28;
const MAX_CHUNK = 260;

const isAbbreviation = (raw: string, dotIndex: number): boolean => {
  let start = dotIndex;
  while (start > 0 && /[\p{L}°]/u.test(raw[start - 1])) start--;
  const word = raw.slice(start, dotIndex).toLowerCase();
  return word.length > 0 && (ABBREVIATIONS.has(word) || (word.length === 1 && /\p{L}/u.test(word)));
};

/**
 * Découpe la réponse écrite, au fur et à mesure qu'elle arrive, en morceaux à lire d'un trait. `from` : ce qui est déjà lu.
 * Rend les morceaux COMPLETS (fin de phrase, de ligne ou de bloc de code refermé) et la position d'où reprendre ; `final` : tout le
 * reste part aussi. Une abréviation (« M. Diop »), un nombre (« 3.5 ») ou des points de suspension ne finissent pas une phrase ; un
 * morceau trop court (« Oui. ») n'est pas lu seul : il attend la suite, pour qu'une lecture ne soit pas hachée.
 */
export function takeSpeech(raw: string, from: number, final: boolean): SpeechChunks {
  const chunks: string[] = [];
  let cursor = from;
  let fence: string | null = null;
  let lineStart = from === 0 || raw[from - 1] === "\n";

  const flush = (end: number, force: boolean) => {
    const text = toSpeakable(raw.slice(cursor, end));
    if (!text) {
      cursor = end;
      return;
    }
    if (text.length < MIN_CHUNK && !force) return; // trop court : le morceau grandit avec la suite
    cursor = end;
    chunks.push(...cutLong(text));
  };

  for (let i = from; i < raw.length; i++) {
    const char = raw[i];
    if (lineStart) {
      const lineEnd = raw.indexOf("\n", i);
      const match = FENCE.exec(raw.slice(i, lineEnd === -1 ? raw.length : lineEnd));
      if (fence === null && match) {
        flush(i, true); // ce qui précédait le bloc de code est lu avant lui
        fence = match[1][0];
        if (lineEnd === -1) break; // l'ouverture est la dernière ligne reçue
        i = lineEnd;
        lineStart = true;
        continue;
      }
      if (fence !== null) {
        if (match && match[1][0] === fence) {
          fence = null;
          cursor = lineEnd === -1 ? raw.length : lineEnd + 1; // bloc refermé : on reprend après lui
        }
        if (lineEnd === -1) break;
        i = lineEnd;
        lineStart = true;
        continue;
      }
    }
    lineStart = false;
    if (char === "\n") {
      lineStart = true;
      flush(i + 1, false);
      continue;
    }
    if (".!?…".includes(char)) {
      let end = i;
      while (end + 1 < raw.length && ".!?…".includes(raw[end + 1])) end++; // « ?! », « ... »
      const next = raw[end + 1];
      const boundary = end + 1 < raw.length ? /\s/.test(next) : final;
      const decimal = char === "." && /\d/.test(raw[i - 1] ?? "") && /\d/.test(next ?? "");
      if (boundary && !decimal && !(char === "." && end === i && isAbbreviation(raw, i))) flush(end + 1, false);
      i = end;
    }
  }
  if (final) {
    if (fence === null) flush(raw.length, true);
    else cursor = raw.length; // un bloc de code jamais refermé n'est pas lu
  }
  return { chunks, next: cursor };
}

/** Coupe un morceau trop long (latence avant le premier son) aux virgules, points-virgules ou espaces. */
function cutLong(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHUNK) {
    const window = rest.slice(0, MAX_CHUNK);
    let cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(" : "));
    if (cut < MAX_CHUNK / 2) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = MAX_CHUNK;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// ── L'automate des phases ────────────────────────────────────────────────────
//
// Plusieurs choses se chevauchent en vrai : on peut reprendre la parole pendant qu'une phrase est encore en transcription, ou pendant que
// DONNA réfléchit ou lit. `phase` est ce qu'on montre (la plus pressante : on t'entend > on transcrit > elle répond) ; `pending` compte
// les transcriptions en cours, pour que rien de ce qui a été dit ne se perde.

export type VoicePhase = "off" | "starting" | "listening" | "hearing" | "transcribing" | "thinking" | "speaking" | "error";
export type VoiceError = "permission" | "noMic" | "micLost" | "unsupported";
export type VoiceNotice = "noSpeech" | "transcribe" | "ttsDown" | "inactive" | null;

export type VoiceState = { phase: VoicePhase; muted: boolean; error: VoiceError | null; notice: VoiceNotice; heard: string; pending: number };

export const voiceOff: VoiceState = { phase: "off", muted: false, error: null, notice: null, heard: "", pending: 0 };

export type VoiceEvent =
  | { type: "begin" }
  | { type: "micReady" }
  | { type: "micError"; error: VoiceError }
  /** La personne se met à parler (y compris pendant que DONNA réfléchit ou lit : c'est une coupure). */
  | { type: "speechStart" }
  /** Fin de la parole : `sent` = l'extrait part en transcription ; sinon il était trop court et a été jeté. */
  | { type: "speechEnd"; sent: boolean }
  /** Une transcription est revenue. `hold` : du texte attend d'être envoyé à DONNA ; `failed` : la transcription a échoué. */
  | { type: "transcribed"; hold: boolean; failed?: boolean }
  /** Le texte entendu part chez DONNA comme message. */
  | { type: "submit"; text: string }
  | { type: "speakStart" }
  | { type: "turnOver" }
  | { type: "interrupt" }
  | { type: "mute"; muted: boolean }
  | { type: "notice"; notice: VoiceNotice }
  | { type: "end"; notice?: VoiceNotice };

const live = (phase: VoicePhase): boolean => phase !== "off" && phase !== "starting" && phase !== "error";
const idle = (pending: number): VoicePhase => (pending > 0 ? "transcribing" : "listening");

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case "begin":
      return { ...voiceOff, phase: "starting" };
    case "micReady":
      return state.phase === "starting" ? { ...state, phase: "listening" } : state;
    case "micError":
      return { ...voiceOff, phase: "error", error: event.error };
    case "speechStart":
      return live(state.phase) && !state.muted ? { ...state, phase: "hearing", notice: null } : state;
    case "speechEnd": {
      if (state.phase !== "hearing") return state;
      const pending = state.pending + (event.sent ? 1 : 0);
      return { ...state, pending, phase: idle(pending) };
    }
    case "transcribed": {
      const pending = Math.max(0, state.pending - 1);
      const next = { ...state, pending };
      if (state.phase !== "transcribing" || pending > 0) return next; // on parle encore, ou d'autres transcriptions arrivent
      if (event.hold) return next; // le texte est prêt : `submit` suit
      return { ...next, phase: "listening", notice: event.failed ? "transcribe" : "noSpeech" };
    }
    case "submit":
      return live(state.phase) && state.phase !== "hearing" ? { ...state, phase: "thinking", heard: event.text, notice: null } : state;
    case "speakStart":
      return state.phase === "thinking" ? { ...state, phase: "speaking" } : state;
    case "turnOver":
    case "interrupt":
      return state.phase === "thinking" || state.phase === "speaking" ? { ...state, phase: idle(state.pending) } : state;
    case "mute":
      return live(state.phase) ? { ...state, muted: event.muted, phase: event.muted && state.phase === "hearing" ? idle(state.pending) : state.phase } : state;
    case "notice":
      return { ...state, notice: event.notice };
    case "end":
      return { ...voiceOff, notice: event.notice ?? null };
  }
}
