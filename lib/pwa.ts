/**
 * Application installable (PWA) : l'événement `beforeinstallprompt` n'est émis qu'UNE fois, tôt dans la vie de la page,
 * donc il est capté dès la racine (components/pwa-register.tsx) et conservé ici pour le bouton « Installer » des réglages,
 * qui n'existe pas encore à ce moment-là. Les fonctions pures (détection iOS, mode installé) sont testées dans pwa.test.ts.
 */

/** Événement non standard (Chrome, Edge, Android) qui permet de déclencher l'invite d'installation soi-même. */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const subscribeInstall = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const installPromptSnapshot = (): InstallPromptEvent | null => deferred;

/** Branche les écouteurs de la fenêtre ; rend la fonction qui les retire. */
export function captureInstallPrompt(target: Window = window): () => void {
  const onPrompt = (event: Event) => {
    event.preventDefault(); // pas de mini-barre automatique : l'invite se déclenche depuis le bouton des réglages
    deferred = event as InstallPromptEvent;
    emit();
  };
  const onInstalled = () => {
    deferred = null;
    emit();
  };
  target.addEventListener("beforeinstallprompt", onPrompt);
  target.addEventListener("appinstalled", onInstalled);
  return () => {
    target.removeEventListener("beforeinstallprompt", onPrompt);
    target.removeEventListener("appinstalled", onInstalled);
  };
}

/** Ouvre l'invite d'installation du navigateur. Vrai si l'utilisateur a accepté. L'événement ne sert qu'une fois. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  emit();
  try {
    await event.prompt();
    return (await event.userChoice).outcome === "accepted";
  } catch {
    return false;
  }
}

type Device = { userAgent: string; platform?: string; maxTouchPoints?: number };

/** iPhone / iPad (y compris iPadOS, qui se présente comme un Mac tactile) : pas d'invite programmable, un geste manuel. */
export function isIos({ userAgent, platform = "", maxTouchPoints = 0 }: Device): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

/** Sur iOS, seul Safari sait « Sur l'écran d'accueil » (Chrome et Firefox iOS sont des habillages de WebKit sans ce menu en 16.3-). */
export function iosInstallHint(device: Device): boolean {
  return isIos(device) && !/crios|fxios|edgios|opios|duckduckgo/i.test(device.userAgent);
}

/** Lancée depuis l'écran d'accueil (ou installée par le navigateur) : plus rien à installer. */
export function isStandaloneDisplay(matches: (query: string) => boolean, iosStandalone?: boolean): boolean {
  return matches("(display-mode: standalone)") || matches("(display-mode: window-controls-overlay)") || iosStandalone === true;
}
