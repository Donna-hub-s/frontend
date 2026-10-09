/**
 * Thème clair/sombre.
 *
 * La préférence vit dans le profil (`PATCH /app/profile/me`, liste fermée côté
 * backend : voir app/profile/src/schemas.py::THEMES), donc elle suit la personne
 * d'un appareil à l'autre. Mais le profil arrive APRÈS le premier rendu : lire
 * uniquement le serveur ferait flasher un écran blanc à chaque chargement. D'où
 * un miroir dans le navigateur, posé par un script bloquant avant la première
 * peinture, et recalé dès que le profil est connu.
 *
 * Le CSS ne connaît jamais « system » : `applyTheme` résout toujours en valeur
 * concrète (voir globals.css, bloc `:root[data-theme="dark"]`). Un seul bloc à
 * maintenir au lieu de dupliquer la palette dans une requête média.
 */

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
/** Ce qui finit réellement sur le document. */
export type ResolvedTheme = "light" | "dark";

export const STORAGE_KEY = "donna.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Thème demandé par le système d'exploitation. */
export function systemTheme(): ResolvedTheme {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? systemTheme() : theme;
}

/** Pose le thème sur le document. Idempotent. */
export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    // Stockage refusé (navigation privée stricte, cookies bloqués) : on suit le système.
    return "system";
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Sans miroir local, le thème s'appliquera quand même — avec un flash au chargement.
  }
}

/**
 * Prévient à chaque changement du réglage système. Utile seulement quand la
 * préférence vaut « system » : c'est alors le système qui décide, et il peut
 * basculer pendant que l'onglet est ouvert (coucher du soleil, bascule manuelle).
 */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Script injecté tel quel dans le <head>, AVANT toute peinture. Il ne peut donc
 * rien importer : tout est inliné, et il échoue en silence (un thème raté ne doit
 * jamais empêcher la page de s'afficher).
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(t!=="light"&&t!=="dark"&&t!=="system")t="system";document.documentElement.dataset.theme=t==="system"?(window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light"):t;}catch(e){document.documentElement.dataset.theme="light";}})();`;
