import { useId } from "react";
import { ORB_GEOMETRY } from "./orb-geometry";

/**
 * Orbe de DONNA : un disque, cinq états (design/fondations/etats).
 * - idle      : point et halo qui respire — disponible
 * - listening : ondes qui partent du point — l'utilisateur écrit
 * - thinking  : trait en S qui oscille — elle réfléchit, avant toute action
 * - working   : boucle qui tourne — elle agit (outils, recherche, documents)
 * - answering : logo et halo — elle répond
 * Les animations s'arrêtent avec « réduire les animations » (voir globals.css).
 */
export type OrbState = "idle" | "listening" | "thinking" | "working" | "answering";

const DISCS: Record<OrbState, readonly string[]> = {
  idle: ["#F7F1EE", "#F2EDEB", "#F3EFED"],
  listening: ["#FAEBE5", "#F7EEEA", "#F5F0EE"],
  thinking: ORB_GEOMETRY.thinking.disc,
  working: ORB_GEOMETRY.working.disc,
  answering: ORB_GEOMETRY.answering.disc,
};

const FIGURE_CLASS: Record<"thinking" | "working" | "answering", string> = {
  thinking: "orb-think",
  working: "orb-work",
  answering: "orb-answer",
};

/** Identifiants SVG rendus uniques par instance (plusieurs orbes par page). */
function scoped(markup: string, suffix: string) {
  return markup.replace(/id="([^"]+)"/g, `id="$1-${suffix}"`).replace(/url\(#([^)]+)\)/g, `url(#$1-${suffix})`);
}

export function DonnaOrb({
  state = "idle",
  size = 40,
  label = "",
  className = "",
}: {
  state?: OrbState;
  size?: number;
  /** Texte accessible ; vide = décoratif. */
  label?: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const disc = DISCS[state];
  const figure = state === "thinking" || state === "working" || state === "answering" ? ORB_GEOMETRY[state] : null;

  return (
    <svg
      viewBox="-4 -4 108 108"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      data-state={state}
      className={`donna-orb shrink-0 ${className}`}
    >
      <defs>
        <radialGradient id={`orb-disc-${uid}`} cx="0.5" cy="0.45" r="0.55">
          <stop offset="0" stopColor={disc[0]} />
          <stop offset="0.8" stopColor={disc[1]} />
          <stop offset="1" stopColor={disc[2]} />
        </radialGradient>
        <radialGradient id={`orb-dot-${uid}`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#9A4A56" />
          <stop offset="0.6" stopColor="#873844" />
          <stop offset="1" stopColor="#7A2D3B" />
        </radialGradient>
        <radialGradient id={`orb-glow-${uid}`}>
          <stop offset="0" stopColor="#F2C9C2" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#F6DCD4" stopOpacity="0.7" />
          <stop offset="1" stopColor="#F7EDEA" stopOpacity="0" />
        </radialGradient>
        <filter id={`orb-soft-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <filter id={`orb-halo-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        {figure && <g dangerouslySetInnerHTML={{ __html: scoped(figure.defs, uid) }} />}
      </defs>

      {state === "answering" && (
        <circle className="orb-halo" cx="50" cy="50" r="51.5" fill="#F3DCD5" filter={`url(#orb-halo-${uid})`} />
      )}
      <circle cx="50" cy="50" r="50" fill={`url(#orb-disc-${uid})`} />
      <circle cx="50" cy="50" r="49.6" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="0.8" />

      <g key={state} className="orb-enter">
        {state === "idle" && (
          <>
            <circle className="orb-breathe" cx="50" cy="50" r="30" fill={`url(#orb-glow-${uid})`} />
            <circle cx="50" cy="50" r="7.8" fill={`url(#orb-dot-${uid})`} />
          </>
        )}
        {state === "listening" && (
          <>
            <circle cx="50" cy="50" r="18" fill={`url(#orb-glow-${uid})`} opacity="0.8" />
            <circle className="orb-ripple" cx="50" cy="50" r="22.5" fill="none" stroke="#E9BDB6" strokeWidth="3.6" filter={`url(#orb-soft-${uid})`} />
            <circle className="orb-ripple orb-ripple-late" cx="50" cy="50" r="22.5" fill="none" stroke="#EAC6C0" strokeWidth="3.8" filter={`url(#orb-soft-${uid})`} />
            <circle cx="50" cy="50" r="6.9" fill={`url(#orb-dot-${uid})`} />
          </>
        )}
        {figure && (
          <g className={FIGURE_CLASS[state as keyof typeof FIGURE_CLASS]} dangerouslySetInnerHTML={{ __html: scoped(figure.figure, uid) }} />
        )}
      </g>
    </svg>
  );
}
