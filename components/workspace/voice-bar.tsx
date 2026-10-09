"use client";

import { AudioLines, Mic, MicOff, Square, X } from "lucide-react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { DonnaOrb, type OrbState } from "@/components/brand/donna-orb";
import { useVoiceLevel, type VoiceController } from "@/lib/use-voice-mode";
import type { VoicePhase } from "@/lib/voice";

type Labels = Dictionary["workspace"]["voice"];

const ORB: Record<VoicePhase, OrbState> = {
  off: "idle", starting: "idle", error: "idle", listening: "listening", hearing: "listening", transcribing: "thinking", thinking: "thinking", speaking: "answering",
};

/**
 * Barre du mode vocal, à la place de la zone de saisie : l'état en clair, un niveau de micro, et trois gestes (couper le micro,
 * interrompre DONNA, terminer). Le micro ouvert est TOUJOURS dit en toutes lettres. La conversation reste visible au-dessus : une
 * action proposée (email, événement…) s'y affiche et attend le clic, comme d'habitude — la voix n'approuve rien.
 */
export function VoiceBar({ labels, voice }: { labels: Labels; voice: VoiceController }) {
  const { state } = voice;
  const level = useVoiceLevel();
  const busy = state.phase === "thinking" || state.phase === "speaking";
  const status = {
    off: "", starting: labels.starting, listening: labels.listening, hearing: labels.hearing, transcribing: labels.transcribing,
    thinking: labels.thinking, speaking: labels.speaking, error: "",
  }[state.phase];
  const error = state.error ? labels.errors[state.error] : null;
  const notice = state.notice ? labels.notices[state.notice] : null;

  return (
    <section aria-label={labels.start} data-testid="voice-bar" data-phase={state.phase} className="px-4 pb-4 md:px-8">
      <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-3 rounded-panel border border-bordeaux-700/30 bg-surface p-4 shadow-float">
        <div className="flex items-center gap-4">
          <DonnaOrb state={ORB[state.phase]} size={52} label="" />
          <div className="min-w-0 flex-1">
            <p role="status" aria-live="polite" className="text-panel-title font-medium text-ink">
              {error ? "" : status}
            </p>
            {error ? (
              <p role="alert" className="text-secondary text-danger text-pretty">{error}</p>
            ) : (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-3">
                <span className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${state.muted ? "text-ink-3" : "text-danger"}`}>
                  <span aria-hidden className={`size-2 rounded-full ${state.muted ? "bg-ink-3" : "pending-dot bg-danger"}`} />
                  {state.muted ? labels.micMuted : labels.micLive}
                </span>
                <span aria-hidden className="h-1.5 w-24 overflow-hidden rounded-full bg-fill">
                  <span className="block h-full rounded-full bg-bordeaux-700 transition-[width] duration-100" style={{ width: `${Math.round((state.muted ? 0 : level) * 100)}%` }} />
                </span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!error && (
              <>
                <button
                  type="button"
                  onClick={() => voice.mute(!state.muted)}
                  aria-pressed={state.muted}
                  aria-label={state.muted ? labels.unmute : labels.mute}
                  title={state.muted ? labels.unmute : labels.mute}
                  className="flex size-10 items-center justify-center rounded-button text-ink-2 hover:bg-active hover:text-ink"
                >
                  {state.muted ? <MicOff size={19} /> : <Mic size={19} />}
                </button>
                <button
                  type="button"
                  onClick={voice.interrupt}
                  disabled={!busy}
                  aria-label={labels.interrupt}
                  title={labels.interrupt}
                  className="flex size-10 items-center justify-center rounded-button text-ink-2 hover:bg-active hover:text-ink disabled:opacity-30"
                >
                  <Square size={16} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={voice.stop}
              aria-label={labels.end}
              title={labels.end}
              className="flex size-10 items-center justify-center rounded-button bg-bordeaux-700 text-white hover:bg-bordeaux-900"
            >
              <X size={19} />
            </button>
          </div>
        </div>
        {state.heard && !error && <p className="text-secondary text-ink-2 text-pretty">{labels.heard.replace("{text}", state.heard)}</p>}
        {notice && !error && <p role="status" className="text-secondary text-danger text-pretty">{notice}</p>}
        <p className="text-meta text-ink-3 text-pretty">{labels.headphones} {labels.approvalNote}</p>
      </div>
    </section>
  );
}

/** Bouton d'entrée du mode vocal, dans la barre d'outils du composer. */
export function VoiceStartButton({ labels, onStart, disabled }: { labels: Labels; onStart: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      aria-label={labels.start}
      title={`${labels.start} — ${labels.startHint}`}
      className="flex size-9 items-center justify-center rounded-button text-ink-2 hover:bg-active hover:text-ink disabled:opacity-50"
    >
      <AudioLines size={18} />
    </button>
  );
}
