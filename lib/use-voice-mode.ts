"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { voiceSession, type SessionOptions } from "./voice-session";
import { voiceOff, voiceTurnOf, type VoiceState, type VoiceTurnStatus } from "./voice";

export type VoiceController = {
  state: VoiceState;
  /** Nombre de messages au moment du dernier énoncé envoyé : la réponse à lire est la première de DONNA qui suit. */
  marker: number | null;
  start: () => Promise<void>;
  stop: () => void;
  mute: (muted: boolean) => void;
  interrupt: () => void;
};

/**
 * Branche un composant de conversation sur la session vocale de l'onglet (lib/voice-session.ts). La session vit hors du composant : elle
 * survit au remontage qui suit la création d'une conversation, et s'arrête quand on quitte vraiment la conversation.
 * `messages` : le fil affiché ; la session y repère la réponse à lire et la prononce phrase par phrase, à mesure qu'elle arrive.
 */
export function useVoiceMode(
  options: SessionOptions & { messages: readonly { id: string; role: string; content: string; status?: VoiceTurnStatus }[] },
): VoiceController {
  const state = useSyncExternalStore(voiceSession.subscribe, voiceSession.getState, () => voiceOff);
  const marker = useSyncExternalStore(voiceSession.subscribe, voiceSession.getMarker, () => null);
  const { lang, onUtterance, onInterrupt, messages } = options;
  // La réponse à lire : la première de DONNA après le dernier énoncé envoyé (le repère vient de la session).
  const turn = useMemo(() => voiceTurnOf(messages, marker), [messages, marker]);

  useEffect(() => {
    voiceSession.bind({ lang, onUtterance, onInterrupt });
  });
  useEffect(() => () => voiceSession.release(), []);
  useEffect(() => {
    voiceSession.feed(turn);
  }, [turn?.id, turn?.content, turn?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state, marker,
    start: () => voiceSession.start(),
    stop: () => voiceSession.stop(),
    mute: (muted) => voiceSession.mute(muted),
    interrupt: () => voiceSession.interrupt(),
  };
}

/** Niveau du micro (0 à 1), à part : il change ~10 fois par seconde et ne doit faire re-rendre que la barre qui l'affiche. */
export function useVoiceLevel(): number {
  return useSyncExternalStore(voiceSession.subscribeLevel, voiceSession.getLevel, () => 0);
}
