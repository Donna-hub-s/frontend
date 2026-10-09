/**
 * Relier un service Google (Gmail, Agenda ou Drive) depuis l'espace de travail, et revenir là d'où l'on est parti.
 *
 * Les trois lignes des connecteurs partageaient un seul bouton « Autoriser » qui redemandait tout, puis renvoyait sur une nouvelle
 * conversation vide — le sélecteur Drive se fermait au milieu d'un geste. Ici : un lien par service, et un chemin de retour.
 *
 * Tout ce qui vient de l'adresse est traité comme forgeable : les services passent par une liste fermée, et le chemin de retour doit
 * être une page de l'espace de travail, dans la langue courante (le backend revérifie l'origine, voir routes/oauth.py::_safe_redirect).
 */

/** Services reliables un à un (backend : xauth/src/providers/google.py::SERVICE_SCOPES — mêmes noms). */
export const GOOGLE_SERVICES = ["gmail", "calendar", "drive"] as const;
export type GoogleService = (typeof GOOGLE_SERVICES)[number];

export const isGoogleService = (value: unknown): value is GoogleService =>
  typeof value === "string" && (GOOGLE_SERVICES as readonly string[]).includes(value);

/**
 * Chemin où ramener l'utilisateur après la liaison : une page de l'espace de travail (`/<lang>/app…`), jamais une adresse libre.
 * Sans requête ni fragment : ils peuvent porter un jeton, et la page se recharge de toute façon.
 */
export function safeReturnPath(lang: string, candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const path = candidate.split(/[?#]/, 1)[0];
  const prefix = `/${lang}/app`;
  if (path !== prefix && !path.startsWith(`${prefix}/`)) return null;
  // Des segments simples seulement : ni « .. », ni « // » (adresse relative au protocole), ni antislash, ni caractère de contrôle.
  if (!/^[A-Za-z0-9._~\-/]+$/.test(path) || path.includes("..") || path.includes("//")) return null;
  return path;
}

/** Adresse du bouton « relier » : sans `services`, tout est demandé (comme la liaison des Réglages) ; sans `next`, retour à l'accueil. */
export function linkHref(lang: string, options: { services?: readonly GoogleService[]; next?: string | null } = {}): string {
  const params = new URLSearchParams({ lang, link: "1" });
  if (options.services?.length) params.set("services", options.services.join(","));
  const next = safeReturnPath(lang, options.next);
  if (next) params.set("next", next);
  return `/oauth/google?${params}`;
}

/** Ce que la route `/oauth/google` lit dans son adresse : des services connus (sans doublon) et un chemin de retour sûr. */
export function parseLinkRequest(params: URLSearchParams, lang: string): { services: GoogleService[]; next: string | null } {
  const services = (params.get("services") ?? "").split(",").map((name) => name.trim()).filter(isGoogleService);
  return { services: [...new Set(services)], next: safeReturnPath(lang, params.get("next")) };
}
