"use client";

import { useEffect, useId, useState } from "react";
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
 *
 * Changement d'état : les cinq dessins n'ont pas la même structure, donc rien à interpoler — mais l'ancien ne disparaît plus
 * d'un coup. Il reste dessous, immobile, le temps que le nouveau apparaisse par-dessus (fondu enchaîné, voir `ORB_SWITCH_MS`).
 * Le nouveau dessin fond par-dessus un ancien qui reste OPAQUE : en faisant fondre les deux l'un vers l'autre, le disque passerait
 * brièvement à 75 % d'opacité et l'orbe clignoterait.
 */
export type OrbState = "idle" | "listening" | "thinking" | "working" | "answering";

/** Enveloppe d'animation de la figure entière (idle et listening animent des éléments précis, repérés dans la géométrie). */
const FIGURE_CLASS: Partial<Record<OrbState, string>> = {
  thinking: "orb-think",
  working: "orb-work",
  answering: "orb-answer",
};

/**
 * Durée du fondu enchaîné d'un état à l'autre. Doit rester égale à celle de `.orb-enter` / `.orb-layer-in` / `.orb-halo-out`
 * dans globals.css (un test le vérifie) : passé ce délai, l'ancien dessin est retiré.
 */
export const ORB_SWITCH_MS = 280;

/** Identifiants SVG rendus uniques par instance (plusieurs orbes par page). */
function scoped(markup: string, suffix: string) {
  return markup.replace(/id="([^"]+)"/g, `id="$1-${suffix}"`).replace(/url\(#([^)]+)\)/g, `url(#$1-${suffix})`);
}

/** Un état complet : halo, disque, liseré et figure. `entering` : il apparaît par-dessus un ancien ; `leaving` : il s'efface dessous. */
function Layer({ state, uid, entering = false, leaving = false }: { state: OrbState; uid: string; entering?: boolean; leaving?: boolean }) {
  const { disc, defs, halo, figure } = ORB_GEOMETRY[state];
  const discId = `orb-disc-${uid}-${state}`;

  return (
    <g data-layer={state} className={entering ? "orb-layer-in" : undefined}>
      <defs>
        <radialGradient id={discId} cx="0.5" cy="0.45" r="0.55">
          <stop offset="0" stopColor={disc[0]} />
          <stop offset="0.8" stopColor={disc[1]} />
          <stop offset="1" stopColor={disc[2]} />
        </radialGradient>
        <g dangerouslySetInnerHTML={{ __html: scoped(defs, uid) }} />
      </defs>

      {/* Seul le halo de l'ancien état s'éteint : il dépasse du disque, que le disque du nouvel état ne recouvre donc pas. */}
      {halo && <g className={leaving ? "orb-halo-out" : undefined} dangerouslySetInnerHTML={{ __html: scoped(halo, uid) }} />}
      <circle cx="50" cy="50" r="50" fill={`url(#${discId})`} />
      <circle cx="50" cy="50" r="49.6" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="0.8" />

      <g className="orb-enter">
        <g className={FIGURE_CLASS[state]} dangerouslySetInnerHTML={{ __html: scoped(figure, uid) }} />
      </g>
    </g>
  );
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
  // L'état affiché au rendu précédent : quand `state` change, il devient l'ancien dessin, gardé `ORB_SWITCH_MS` (ajustement
  // pendant le rendu, la forme documentée par React pour garder une valeur du rendu précédent — pas d'effet qui relance un rendu).
  const [shown, setShown] = useState(state);
  const [leaving, setLeaving] = useState<OrbState | null>(null);
  if (state !== shown) {
    setShown(state);
    setLeaving(shown);
  }
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), ORB_SWITCH_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

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
      {/* Les couches sont CLÉES par état : l'ancienne garde son élément (son animation ne repart pas de zéro, sinon elle
          clignoterait au moment de s'effacer) et la nouvelle se monte par-dessus. */}
      {leaving && <Layer key={leaving} state={leaving} uid={uid} leaving />}
      <Layer key={state} state={state} uid={uid} entering={leaving !== null} />
    </svg>
  );
}
