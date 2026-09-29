"use client";

import { defaultLocale, isLocale } from "@/i18n/config";

/**
 * Perte de session pendant que l'application est ouverte.
 *
 * Le proxy `/api/donna/*` tente déjà de renouveler le jeton d'accès quand le
 * backend répond 401 (voir app/api/donna/[...path]/route.ts). Si ce
 * renouvellement échoue, la session est morte : il ne reste qu'à renvoyer vers
 * la connexion, en conservant la page demandée dans « next » pour y revenir.
 *
 * La redirection est posée sur `fetch` plutôt que sur chaque appel : le client
 * parle au backend par une dizaine d'endpoints (chat, projets, recherche,
 * paramètres, ticket websocket…), et il serait facile d'en oublier un.
 */

let redirecting = false;
let installed = false;

/** Vrai si l'URL vise la passerelle DONNA (et non un autre origine). */
function isDonnaApi(input: RequestInfo | URL): boolean {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(raw, window.location.origin).pathname.startsWith("/api/donna/");
  } catch {
    return false;
  }
}

/** Redirige vers /login en gardant la page courante. Idempotent. */
export function redirectToLogin(): void {
  if (redirecting || typeof window === "undefined") return;
  const { pathname, search } = window.location;
  const [, maybeLang] = pathname.split("/");
  const lang = isLocale(maybeLang) ? maybeLang : defaultLocale;
  // Déjà sur la connexion : ne pas boucler (un 401 y est une erreur de formulaire).
  if (pathname === `/${lang}/login`) return;

  const target = new URL(`/${lang}/login`, window.location.origin);
  target.searchParams.set("error", "sessionExpired");
  // Seul un chemin de l'espace de travail est repris : safeNext (lib/auth-flow)
  // refuse de toute façon le reste, autant ne pas envoyer de bruit.
  if (pathname.startsWith(`/${lang}/app`)) target.searchParams.set("next", `${pathname}${search}`);

  redirecting = true;
  // `replace` et non `push` : la page morte ne doit pas revenir au bouton « précédent ».
  window.location.replace(target.toString());
}

/**
 * Installe la garde 401 → /login. Installation unique et non réversible : le
 * provider vit toute la session, et un démontage/montage en StrictMode
 * réinstallerait un patch au-dessus du précédent.
 */
export function installSessionGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await original(input, init);
    if (response.status === 401 && isDonnaApi(input)) redirectToLogin();
    return response;
  };

  // Onglet resté ouvert trop longtemps : la session a pu expirer pendant que
  // l'utilisateur ne faisait rien. `visibilitychange` ne se déclenche qu'au
  // retour sur l'onglet, donc on ne teste que là.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !redirecting) void probeSession();
  });
}

/** Vérifie que la session tient encore (appel léger, `cache: no-store`). */
async function probeSession(): Promise<void> {
  try {
    await fetch("/api/donna/auth/me", { cache: "no-store" });
  } catch {
    // Réseau coupé : ce n'est pas une session expirée, on ne redirige pas.
  }
}
