// Largeur des panneaux dockés (document partagé) : l'utilisateur la tire, le navigateur s'en souvient.
//
// Bornée des DEUX côtés, et relativement à la fenêtre : la valeur est relue d'un autre écran (un portable
// après un moniteur large) où une largeur enregistrée en pixels ne veut plus rien dire — un panneau qui
// occupe toute la fenêtre cacherait la conversation, et il n'y a pas d'autre geste pour le ramener.

/** Largeurs en pixels, au-dessus de `lg` (sous `lg` le panneau est en plein écran : rien à régler). */
export const PANEL_MIN_WIDTH = 384; // 24rem — ce que valait `lg:min-w-[24rem]`
export const PANEL_MAX_RATIO = 0.8; // jamais plus de 80 % de la fenêtre : la conversation reste visible

/** La largeur gardée : bornée au minimum lisible et à ce que la fenêtre peut offrir. */
export function clampPanelWidth(width: number, viewport: number): number {
  const max = Math.max(PANEL_MIN_WIDTH, Math.round(viewport * PANEL_MAX_RATIO));
  if (!Number.isFinite(width)) return PANEL_MIN_WIDTH;
  return Math.min(max, Math.max(PANEL_MIN_WIDTH, Math.round(width)));
}

/** Lecture d'une largeur enregistrée : tout ce qui n'est pas un nombre utilisable rend `null` (largeur par défaut). */
export function readPanelWidth(raw: string | null, viewport: number): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? clampPanelWidth(value, viewport) : null;
}

// ── Store (navigateur) ───────────────────────────────────────────────────────
// Même raison que `sidebar-collapsed.ts` : un réglage que seul le navigateur connaît, lu par
// `useSyncExternalStore` pour que le rendu serveur (largeur par défaut) et l'hydratation s'accordent.

export const PANEL_WIDTH_KEY = "donna:canvas-width";
/** `lg` de Tailwind : sous ce seuil le panneau est en plein écran, une largeur n'y veut rien dire. */
const WIDE_QUERY = "(min-width: 64rem)";

const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

export function subscribePanelWidth(onChange: () => void): () => void {
  if (!listeners.size) {
    // La fenêtre change de taille : la largeur gardée est ramenée dans ses bornes (voir clampPanelWidth).
    window.addEventListener("resize", notify);
    window.addEventListener("storage", notify);
  }
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (!listeners.size) {
      window.removeEventListener("resize", notify);
      window.removeEventListener("storage", notify);
    }
  };
}

/** Relue depuis le stockage à chaque instantané : déterministe pour une fenêtre donnée, donc stable
 * entre deux notifications — ce que React exige de `getSnapshot`. */
export function panelWidthSnapshot(): number | null {
  try {
    return readPanelWidth(localStorage.getItem(PANEL_WIDTH_KEY), window.innerWidth);
  } catch {
    return null; // stockage refusé : largeur par défaut
  }
}

export function panelWideSnapshot(): boolean {
  return window.matchMedia(WIDE_QUERY).matches;
}

export const panelWidthServerSnapshot = (): number | null => null;
export const panelWideServerSnapshot = (): boolean => false;

export function setPanelWidth(width: number): void {
  const clamped = clampPanelWidth(width, window.innerWidth);
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(clamped));
  } catch {
    // Le réglage ne survivra pas au rechargement ; il ne s'applique pas non plus, faute d'endroit où le lire.
  }
  notify();
}
