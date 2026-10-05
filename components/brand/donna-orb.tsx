import { useId } from "react";
import { ORB_GEOMETRY } from "./orb-geometry";

/**
 * Orbe de DONNA : un disque, cinq états (fondations/etats).
 * - idle      : point et halo qui respire — disponible
 * - listening : ondes qui partent du point — l'utilisateur écrit ou parle
 * - thinking  : trait en S qui oscille — elle réfléchit, avant toute action
 * - working   : boucle qui tourne — elle agit (outils, recherche, documents)
 * - answering : logo et halo — elle répond
 *
 * Le dessin des cinq états vient de la référence (fondations/etats/*.svg) via orb-geometry.ts, généré par
 * scripts/orb-geometry.mjs : AUCUNE valeur n'est recopiée ici. Un test (donna-orb.test.ts) compare le rendu à la référence.
 * Les animations s'arrêtent avec « réduire les animations » (voir globals.css) : l'orbe retombe alors sur le dessin de la
 * référence, tel quel.
 */
export type OrbState = "idle" | "listening" | "thinking" | "working" | "answering";

/** Enveloppe d'animation de la figure entière (idle et listening animent des éléments précis, repérés dans la géométrie). */
const FIGURE_CLASS: Partial<Record<OrbState, string>> = {
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
  const { disc, defs, halo, figure } = ORB_GEOMETRY[state];

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
        <g dangerouslySetInnerHTML={{ __html: scoped(defs, uid) }} />
      </defs>

      {halo && <g dangerouslySetInnerHTML={{ __html: scoped(halo, uid) }} />}
      <circle cx="50" cy="50" r="50" fill={`url(#orb-disc-${uid})`} />
      <circle cx="50" cy="50" r="49.6" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="0.8" />

      <g key={state} className="orb-enter">
        <g className={FIGURE_CLASS[state]} dangerouslySetInnerHTML={{ __html: scoped(figure, uid) }} />
      </g>
    </svg>
  );
}
