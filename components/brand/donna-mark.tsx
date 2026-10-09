import { useId } from "react";
import { MARK_DEEP, MARK_HIGHLIGHT, MARK_SHADE, MARK_SILHOUETTE } from "./mark-paths";

type Variant = "plain" | "tile" | "dark" | "circle";

// Couleurs par variante : dégradé du ruban, reflet, ombre, ombre profonde, fond.
const PALETTES = {
  light: { from: "#A65A66", to: "#7C3040", highlight: "#D9A3A2", shade: "#5E1B2A", deep: "#3A0C15" },
  // Sur fond sombre, le logo s'inverse : ruban pêche, ombres rosées.
  onDark: { from: "#FDFAF8", to: "#E3ADAA", highlight: "#FFFFFF", shade: "#D99A98", deep: "#B7777A" },
} as const;

// La variante « plain » pose le logo directement sur la page : il suit donc le THÈME. Ses couleurs sont les jetons --mark-* de
// globals.css (clair : la palette « light » ci-dessus ; sombre : « onDark »). Avant, il restait bordeaux sur un fond presque noir
// — ~2:1 de contraste. Les variantes à tuile (tile, dark, circle) portent leur propre fond : elles gardent leur palette fixe.
const THEMED = {
  from: "var(--mark-from)",
  to: "var(--mark-to)",
  highlight: "var(--mark-highlight)",
  shade: "var(--mark-shade)",
  deep: "var(--mark-deep)",
} as const;

const SURFACES: Record<Exclude<Variant, "plain">, { className: string; palette: keyof typeof PALETTES }> = {
  tile: {
    className:
      "rounded-[22%] bg-[linear-gradient(160deg,#FDFAF8_0%,#F6E1D6_100%)] shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_0_0_1px_rgb(89_26_41/0.06),0_12px_28px_-12px_rgb(89_26_41/0.28)]",
    palette: "light",
  },
  dark: {
    className:
      "rounded-[22%] bg-[linear-gradient(160deg,#3A1E23_0%,#1C0E11_100%)] shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_12px_28px_-12px_rgb(28_14_17/0.5)]",
    palette: "onDark",
  },
  circle: {
    className:
      "rounded-full bg-[radial-gradient(circle_at_35%_30%,#7C3040_0%,#591A29_60%,#45131F_100%)] shadow-[0_12px_28px_-12px_rgb(89_26_41/0.45)]",
    palette: "onDark",
  },
};

type Props = {
  /** Côté en pixels (le logo est carré). */
  size?: number;
  variant?: Variant;
  /** Nom accessible ; vide = décoratif (masqué aux lecteurs d'écran). */
  label?: string;
  className?: string;
};

/**
 * Logo DONNA : le D en ruban avec profil en négatif.
 * Sous 32 px, les ombres floues sont retirées (illisibles et coûteuses).
 */
export function DonnaMark({ size = 40, variant = "plain", label = "DONNA", className = "" }: Props) {
  const uid = useId().replace(/:/g, "");
  const surface = variant === "plain" ? null : SURFACES[variant];
  const c = surface ? PALETTES[surface.palette] : THEMED;
  const detailed = size >= 32;

  const svg = (
    <svg
      viewBox="0 0 100 100"
      width={surface ? size * 0.66 : size}
      height={surface ? size * 0.66 : size}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={surface ? undefined : className}
    >
      <defs>
        <linearGradient id={`${uid}-ribbon`} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={c.from} />
          <stop offset="1" stopColor={c.to} />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <path d={MARK_SILHOUETTE} />
        </clipPath>
        {detailed && (
          <>
            <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.4" />
            </filter>
            <filter id={`${uid}-crisp`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="0.7" />
            </filter>
          </>
        )}
      </defs>
      <path d={MARK_SILHOUETTE} fill={`url(#${uid}-ribbon)`} />
      {detailed && (
        <g clipPath={`url(#${uid}-clip)`}>
          <path d={MARK_HIGHLIGHT} fill={c.highlight} opacity={0.9} filter={`url(#${uid}-soft)`} />
          <path d={MARK_SHADE} fill={c.shade} opacity={0.85} filter={`url(#${uid}-soft)`} />
          <path d={MARK_DEEP} fill={c.deep} opacity={0.9} filter={`url(#${uid}-crisp)`} />
        </g>
      )}
    </svg>
  );

  if (!surface) return svg;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${surface.className} ${className}`}
      style={{ width: size, height: size }}
    >
      {svg}
    </span>
  );
}

/** Logo + wordmark, pour les en-têtes. */
export function DonnaLockup({ size = 32, signature = true }: { size?: number; signature?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <DonnaMark size={size} label="" />
      <span className="flex flex-col">
        <span className="font-brand text-[1.25rem] leading-6 tracking-wordmark text-brand-strong">DONNA</span>
        {signature && (
          <span className="font-brand text-signature uppercase text-ink-3">powered by xcore</span>
        )}
      </span>
    </span>
  );
}
