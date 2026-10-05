import { describe, expect, it } from "vitest";
import { createVad, DEFAULT_VAD, downsample, encodeWav, takeSpeech, toDb, toSpeakable, voiceOff, voiceReducer, voiceTurnOf, type VadEvent, type VoiceEvent, type VoiceState } from "./voice";

const FRAME = 43; // ms : 2048 échantillons à 48 kHz

/** Rejoue une suite de niveaux (dBFS) dans un VAD et rend les événements avec l'instant où ils tombent. */
function replay(levels: number[], strictFrom = Infinity) {
  const vad = createVad();
  const events: { at: number; event: VadEvent }[] = [];
  levels.forEach((db, i) => {
    const event = vad.push(db, FRAME, i >= strictFrom);
    if (event) events.push({ at: i * FRAME, event });
  });
  return { vad, events };
}
const run = (db: number, ms: number) => Array<number>(Math.round(ms / FRAME)).fill(db);

describe("VAD", () => {
  it("détecte le début d'une phrase après une courte parole continue, puis sa fin après un silence", () => {
    const { events, vad } = replay([...run(-62, 1000), ...run(-25, 1500), ...run(-62, 1500)]);
    expect(events.map((e) => e.event.type)).toEqual(["start", "end"]);
    const start = events[0];
    expect(start.at).toBeGreaterThanOrEqual(1000);
    expect(start.at).toBeLessThan(1000 + DEFAULT_VAD.startMs + 2 * FRAME); // quasi immédiat
    const end = events[1].event as Extract<VadEvent, { type: "end" }>;
    expect(end.reason).toBe("silence");
    expect(end.speechMs).toBeGreaterThan(1300);
    expect(events[1].at - (1000 + 1500)).toBeGreaterThanOrEqual(DEFAULT_VAD.endSilenceMs - FRAME); // la phrase n'est close qu'après ~1,1 s de silence
    expect(vad.speaking).toBe(false);
  });

  it("ne coupe pas une phrase sur une courte pause ni sur une syllabe faible", () => {
    const speech = [...run(-25, 800), ...run(-62, 500), ...run(-25, 800), ...run(-44, 300), ...run(-25, 400)];
    const { events } = replay([...run(-62, 600), ...speech, ...run(-62, 1500)]);
    expect(events.map((e) => e.event.type)).toEqual(["start", "end"]); // une seule phrase
  });

  it("ignore un clic bref : pas assez de parole continue pour commencer", () => {
    const { events } = replay([...run(-62, 800), -20, -20, ...run(-62, 2000)]);
    expect(events).toEqual([]);
  });

  it("jette un extrait trop court (toux) au lieu de l'envoyer", () => {
    const { events } = replay([...run(-62, 800), ...run(-25, 220), ...run(-62, 1600)]);
    expect(events.map((e) => e.event.type)).toEqual(["start", "discard"]);
  });

  it("ne prend pas le bruit de fond pour de la parole, même s'il est assez fort — il s'y adapte", () => {
    const { events, vad } = replay([...run(-45, 4000), ...run(-45, 2000)]);
    expect(events).toEqual([]);
    expect(vad.floorDb).toBeGreaterThan(-50); // le plancher a suivi
    // Une vraie voix 20 dB au-dessus de ce bruit est entendue.
    const withVoice = replay([...run(-45, 4000), ...run(-22, 1200), ...run(-45, 1600)]);
    expect(withVoice.events.map((e) => e.event.type)).toEqual(["start", "end"]);
  });

  it("n'écoute rien sous le seuil absolu, quel que soit le bruit de fond mesuré", () => {
    expect(replay([...run(-80, 3000), ...run(-58, 1500), ...run(-80, 1500)]).events).toEqual([]);
  });

  it("coupe une phrase interminable à la borne d'envoi", () => {
    const { events } = replay([...run(-62, 500), ...run(-25, 33_000)]);
    const end = events.find((e) => e.event.type === "end")?.event as Extract<VadEvent, { type: "end" }>;
    expect(end.reason).toBe("max");
    expect(end.speechMs).toBeLessThanOrEqual(DEFAULT_VAD.maxSpeechMs + FRAME);
  });

  it("exige une voix plus franche et plus longue pour couper DONNA qui parle", () => {
    const talk = [...run(-62, 1000), ...run(-47, 800)]; // un murmure ou l'écho de la lecture : 15 dB au-dessus du bruit
    expect(replay(talk).events.map((e) => e.event.type)).toEqual(["start"]);
    expect(replay(talk, 0).events).toEqual([]); // pendant la lecture : ignoré
    const voice = [...run(-62, 1000), ...run(-25, 800)];
    expect(replay(voice, 0).events.map((e) => e.event.type)).toEqual(["start"]); // une vraie voix coupe quand même
    const brief = [...run(-62, 1000), ...run(-25, 200)];
    expect(replay(brief, 0).events).toEqual([]); // mais pas un son de 200 ms
  });

  it("repart d'un état propre après reset", () => {
    const vad = createVad();
    for (const db of [...run(-62, 600), ...run(-25, 400)]) vad.push(db, FRAME);
    expect(vad.speaking).toBe(true);
    vad.reset();
    expect(vad.speaking).toBe(false);
  });

  it("convertit une amplitude en dBFS sans jamais renvoyer -Infinity", () => {
    expect(toDb(1)).toBeCloseTo(0);
    expect(toDb(0.1)).toBeCloseTo(-20);
    expect(Number.isFinite(toDb(0))).toBe(true);
  });
});

describe("audio", () => {
  it("rééchantillonne à 16 kHz en moyennant, et ne touche pas un signal déjà assez bas", () => {
    const input = Float32Array.from({ length: 4800 }, (_, i) => (i % 3 === 0 ? 0.3 : 0.0)); // 48 kHz
    const out = downsample(input, 48_000);
    expect(out.length).toBe(1600);
    expect(out[10]).toBeCloseTo(0.1); // moyenne de (0.3, 0, 0)
    const low = new Float32Array(10);
    expect(downsample(low, 16_000)).toBe(low);
  });

  it("écrit un WAV valide : en-tête RIFF, PCM 16 bits mono, valeurs bornées", () => {
    const wav = encodeWav(Float32Array.from([0, 0.5, -0.5, 1, -1, 2, -2]), 16_000);
    const view = new DataView(wav.buffer);
    const text = (at: number, n: number) => String.fromCharCode(...wav.slice(at, at + n));
    expect([text(0, 4), text(8, 4), text(12, 4), text(36, 4)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(wav.length).toBe(44 + 7 * 2);
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect([view.getUint16(20, true), view.getUint16(22, true), view.getUint32(24, true), view.getUint16(34, true)]).toEqual([1, 1, 16_000, 16]);
    expect(view.getUint32(40, true)).toBe(14);
    const samples = Array.from({ length: 7 }, (_, i) => view.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0, 16383, -16384, 32767, -32768, 32767, -32768]); // 2 et -2 sont écrêtés, jamais enroulés
  });
});

describe("toSpeakable", () => {
  it("garde ce qui se dit et retire ce qui ne se dit pas", () => {
    const md = "## Résumé\n\n- **Total** : 12 450 €\n- Voir [le rapport](https://x.fr/r) et https://exemple.fr/page\n\n```py\nprint(1)\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> Citation `code` fin 😀";
    expect(toSpeakable(md)).toBe("Résumé\nTotal : 12 450 €\nVoir le rapport et\nCitation code fin");
  });

  it("ne lit jamais le contenu d'un bloc de code, refermé ou non", () => {
    expect(toSpeakable("Avant\n```\nsecret()\n")).toBe("Avant");
    expect(toSpeakable("~~~\nx\n~~~\nAprès")).toBe("Après");
  });

  it("rend une chaîne vide quand il ne reste rien à dire", () => {
    for (const md of ["", "   ", "```\ncode\n```", "| a | b |\n|---|---|", "---", "https://seulement.une/url"]) expect(toSpeakable(md)).toBe("");
  });
});

/** Rejoue une réponse qui arrive par morceaux de `step` caractères : ce que l'on lit, dans l'ordre, et à quelle vitesse. */
function stream(text: string, step: number) {
  const spoken: string[] = [];
  let next = 0;
  for (let end = step; end < text.length + step; end += step) {
    const final = end >= text.length;
    const got = takeSpeech(text.slice(0, Math.min(end, text.length)), next, final);
    spoken.push(...got.chunks);
    next = got.next;
  }
  return { spoken, next };
}

describe("takeSpeech", () => {
  const ANSWER = "Bonjour Awa, voici le point de la semaine. Vous avez trois réunions, dont une avec M. Diop à 9 h 30. Le budget est de 3.5 millions d'euros. C'est validé !\n\nPrêt pour la suite ?";

  it("rend les phrases dans l'ordre, sans les couper sur une abréviation ni sur un nombre décimal", () => {
    expect(stream(ANSWER, 7).spoken).toEqual([
      "Bonjour Awa, voici le point de la semaine.",
      "Vous avez trois réunions, dont une avec M. Diop à 9 h 30.",
      "Le budget est de 3.5 millions d'euros.",
      "C'est validé !\nPrêt pour la suite ?", // « C'est validé ! » est trop court pour être lu seul : il attend la suite
    ]);
  });

  it("lit la même chose quelle que soit la taille des morceaux reçus (jamais de texte perdu ni répété)", () => {
    const reference = stream(ANSWER, ANSWER.length).spoken.join(" ");
    for (const step of [1, 2, 3, 5, 11, 40]) expect(stream(ANSWER, step).spoken.join(" ")).toBe(reference);
    expect(reference.replace(/\s+/g, " ")).toBe(toSpeakable(ANSWER).replace(/\n/g, " ").replace(/\s+/g, " "));
  });

  it("n'avance pas dans une phrase non terminée, et la rend dès qu'elle l'est", () => {
    expect(takeSpeech("Une phrase qui n'est pas finie", 0, false)).toEqual({ chunks: [], next: 0 });
    const done = takeSpeech("Une phrase assez longue qui est finie. Et la suite arr", 0, false);
    expect(done.chunks).toEqual(["Une phrase assez longue qui est finie."]);
    expect(done.next).toBe("Une phrase assez longue qui est finie.".length);
    expect(takeSpeech("Fin sans point", 0, true).chunks).toEqual(["Fin sans point"]); // à la fin de la réponse, tout part
  });

  it("joint une phrase trop courte à la suivante au lieu de la lire seule", () => {
    expect(stream("Oui. Je m'en occupe tout de suite, vous aurez le résultat avant midi.", 4).spoken).toEqual(["Oui. Je m'en occupe tout de suite, vous aurez le résultat avant midi."]);
    expect(takeSpeech("Oui.", 0, true).chunks).toEqual(["Oui."]); // sauf si c'est tout ce qu'il y a
  });

  it("saute les blocs de code et lit ce qui les entoure", () => {
    const text = "Voici la commande à lancer pour tout relancer.\n```bash\nrm -rf /\n```\nEnsuite, vérifiez que tout fonctionne bien.";
    const { spoken } = stream(text, 9);
    expect(spoken).toEqual(["Voici la commande à lancer pour tout relancer.", "Ensuite, vérifiez que tout fonctionne bien."]);
    expect(spoken.join(" ")).not.toContain("rm -rf");
  });

  it("n'ouvre pas un bloc de code au milieu du flux : il attend de savoir s'il est refermé, et un bloc jamais refermé n'est pas lu", () => {
    const partial = takeSpeech("Je vous montre le code complet ici.\n```py\nprint(", 0, false);
    expect(partial.chunks).toEqual(["Je vous montre le code complet ici."]);
    expect(takeSpeech("Je vous montre le code complet ici.\n```py\nprint(1)", partial.next, true).chunks).toEqual([]);
  });

  it("lit une liste à puces ligne par ligne, sans les puces", () => {
    const text = "Trois points importants à retenir aujourd'hui :\n- Le budget est validé par la direction\n- La date limite est vendredi prochain\n- Awa s'occupe de l'envoi final\n";
    expect(stream(text, 6).spoken).toEqual([
      "Trois points importants à retenir aujourd'hui :",
      "Le budget est validé par la direction",
      "La date limite est vendredi prochain",
      "Awa s'occupe de l'envoi final",
    ]);
  });

  it("coupe une phrase interminable à une virgule pour que le premier son arrive vite", () => {
    const long = `${"Un morceau de phrase assez long, ".repeat(14)}et la fin.`;
    const { spoken } = stream(long, 50);
    expect(spoken.length).toBeGreaterThan(1);
    expect(Math.max(...spoken.map((s) => s.length))).toBeLessThanOrEqual(262);
    expect(spoken.join(" ").replace(/\s+/g, " ")).toBe(long.replace(/\s+/g, " "));
  });

  it("ne dit rien d'une réponse qui n'est que du code ou un tableau", () => {
    expect(stream("```\nx = 1\n```", 3).spoken).toEqual([]);
    expect(stream("| a | b |\n|---|---|\n| 1 | 2 |\n", 4).spoken).toEqual([]);
  });

  it("gère les points de suspension et « ?! » comme une seule fin de phrase", () => {
    expect(stream("Vraiment... c'est incroyable ?! Je n'y crois pas du tout, honnêtement.", 5).spoken).toEqual(["Vraiment... c'est incroyable ?!", "Je n'y crois pas du tout, honnêtement."]);
  });
});

describe("automate des phases", () => {
  const play = (events: VoiceEvent[], from: VoiceState = voiceOff) => events.reduce(voiceReducer, from);
  const listening = play([{ type: "begin" }, { type: "micReady" }]);
  const said = (...events: VoiceEvent[]) => play([{ type: "speechStart" }, { type: "speechEnd", sent: true }, ...events], listening);

  it("suit le cycle écouter → entendre → transcrire → réfléchir → parler → écouter", () => {
    const phases: string[] = [];
    let state = voiceOff;
    for (const event of [
      { type: "begin" }, { type: "micReady" }, { type: "speechStart" }, { type: "speechEnd", sent: true }, { type: "transcribed", hold: true },
      { type: "submit", text: "Quel temps fait-il ?" }, { type: "speakStart" }, { type: "turnOver" },
    ] as VoiceEvent[]) {
      state = voiceReducer(state, event);
      phases.push(state.phase);
    }
    expect(phases).toEqual(["starting", "listening", "hearing", "transcribing", "transcribing", "thinking", "speaking", "listening"]);
    expect(state).toMatchObject({ heard: "Quel temps fait-il ?", pending: 0 });
  });

  it("revient à l'écoute, avec un avis, quand rien n'a été compris ou que la transcription échoue", () => {
    expect(said({ type: "transcribed", hold: false })).toMatchObject({ phase: "listening", notice: "noSpeech", pending: 0 });
    expect(said({ type: "transcribed", hold: false, failed: true })).toMatchObject({ phase: "listening", notice: "transcribe" });
    expect(play([{ type: "speechStart" }], said({ type: "transcribed", hold: false })).notice).toBeNull(); // l'avis s'efface dès qu'on reparle
  });

  it("ne perd rien quand on reprend la parole pendant qu'une phrase est encore en transcription", () => {
    let state = said();
    expect(state).toMatchObject({ phase: "transcribing", pending: 1 });
    state = play([{ type: "speechStart" }], state);
    expect(state).toMatchObject({ phase: "hearing", pending: 1 }); // on t'entend : c'est ce qu'on montre
    state = play([{ type: "transcribed", hold: true }], state);
    expect(state).toMatchObject({ phase: "hearing", pending: 0 }); // le premier texte est revenu, il est tenu en attente
    state = play([{ type: "speechEnd", sent: true }], state);
    expect(state).toMatchObject({ phase: "transcribing", pending: 1 });
    state = play([{ type: "transcribed", hold: true }, { type: "submit", text: "première partie et seconde partie" }], state);
    expect(state).toMatchObject({ phase: "thinking", pending: 0, heard: "première partie et seconde partie" });
  });

  it("attend la dernière transcription avant de se déclarer sans rien comprendre", () => {
    const two = play([{ type: "speechStart" }, { type: "speechEnd", sent: true }], said());
    expect(two.pending).toBe(2);
    const first = play([{ type: "transcribed", hold: false }], two);
    expect(first).toMatchObject({ phase: "transcribing", pending: 1, notice: null });
    expect(play([{ type: "transcribed", hold: false }], first)).toMatchObject({ phase: "listening", notice: "noSpeech" });
  });

  it("jette un extrait trop court sans le transcrire", () => {
    expect(play([{ type: "speechStart" }, { type: "speechEnd", sent: false }], listening)).toMatchObject({ phase: "listening", pending: 0 });
  });

  it("laisse reparler pendant que DONNA réfléchit ou parle (coupure)", () => {
    const thinking = said({ type: "transcribed", hold: true }, { type: "submit", text: "x" });
    const speaking = play([{ type: "speakStart" }], thinking);
    expect(speaking.phase).toBe("speaking");
    expect(play([{ type: "interrupt" }], speaking).phase).toBe("listening");
    expect(play([{ type: "speechStart" }], speaking).phase).toBe("hearing");
    expect(play([{ type: "speechStart" }], thinking).phase).toBe("hearing");
  });

  it("ne réagit pas à la parole quand le micro est coupé, ni avant d'être prêt, ni après la fin", () => {
    expect(play([{ type: "speechStart" }], play([{ type: "mute", muted: true }], listening)).phase).toBe("listening");
    expect(play([{ type: "speechStart" }], play([{ type: "begin" }])).phase).toBe("starting");
    expect(play([{ type: "speechStart" }], voiceOff).phase).toBe("off");
    expect(play([{ type: "mute", muted: true }], voiceOff).muted).toBe(false);
  });

  it("couper le micro en pleine phrase abandonne l'écoute en cours", () => {
    expect(play([{ type: "mute", muted: true }], play([{ type: "speechStart" }], listening))).toMatchObject({ phase: "listening", muted: true });
  });

  it("ignore les événements hors de leur phase (aucun saut possible)", () => {
    expect(play([{ type: "speechEnd", sent: true }], listening)).toEqual(listening);
    expect(play([{ type: "submit", text: "x" }], play([{ type: "speechStart" }], listening)).phase).toBe("hearing"); // on n'envoie pas pendant qu'on parle
    expect(play([{ type: "speakStart" }], listening).phase).toBe("listening");
    expect(play([{ type: "turnOver" }], listening).phase).toBe("listening");
    expect(play([{ type: "micReady" }], listening)).toEqual(listening);
    expect(play([{ type: "transcribed", hold: true }], listening).pending).toBe(0); // jamais négatif
  });

  it("s'arrête proprement : erreur de micro, fin demandée, inactivité", () => {
    expect(play([{ type: "micError", error: "permission" }], listening)).toMatchObject({ phase: "error", error: "permission" });
    expect(play([{ type: "end" }], listening)).toEqual(voiceOff);
    expect(play([{ type: "end", notice: "inactive" }], listening)).toMatchObject({ phase: "off", notice: "inactive" });
    expect(play([{ type: "begin" }], play([{ type: "micError", error: "noMic" }]))).toMatchObject({ phase: "starting", error: null });
  });
});

describe("voiceTurnOf", () => {
  const user = (id: string) => ({ id, role: "user", content: "question" });
  const donna = (id: string, content = "réponse", status?: "streaming" | "done") => ({ id, role: "assistant", content, status });

  it("rend la première réponse de DONNA qui suit l'énoncé envoyé", () => {
    const thread = [user("u1"), donna("a1"), user("u2"), donna("a2", "la bonne", "streaming")];
    expect(voiceTurnOf(thread, 2)).toEqual({ id: "a2", content: "la bonne", status: "streaming" });
  });

  it("ne relit jamais une réponse plus ancienne que l'énoncé", () => {
    expect(voiceTurnOf([user("u1"), donna("a1")], 2)).toBeNull();
  });

  it("sans énoncé envoyé, rien n'est à lire", () => {
    expect(voiceTurnOf([user("u1"), donna("a1")], null)).toBeNull();
  });

  it("la réponse n'existe pas encore : rien (elle arrivera au prochain rendu)", () => {
    expect(voiceTurnOf([user("u1")], 0)).toBeNull();
  });

  it("un fil qui raccourcit (branche changée, messages retirés) ne plante pas", () => {
    expect(voiceTurnOf([user("u1")], 7)).toBeNull();
  });
});
