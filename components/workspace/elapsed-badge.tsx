import { visibleElapsed, type ElapsedUnits } from "@/lib/elapsed";

/**
 * Durée écoulée d'un travail en cours (« 12 s », « 1 min 20 »), muette sous quelques secondes — voir lib/elapsed.ts.
 * `now` vient de `useNow` : appelé une fois par liste, jamais ici. `aria-hidden` : la durée change chaque seconde, et les
 * listes d'étapes sont des régions `aria-live` — un lecteur d'écran l'annoncerait en boucle.
 * `className` remplace le style par défaut (taille et couleur) ; `separator` ajoute « · » devant, seulement si la durée s'affiche.
 */
export function ElapsedBadge({
  startedAt,
  now,
  units,
  className = "text-meta text-ink-2",
  separator = false,
}: {
  startedAt: number;
  now: number;
  units: ElapsedUnits;
  className?: string;
  separator?: boolean;
}) {
  const text = visibleElapsed(startedAt, now, units);
  if (!text) return null;
  return (
    <span aria-hidden className={`tabular-nums ${className}`}>
      {separator ? "· " : ""}
      {text}
    </span>
  );
}
