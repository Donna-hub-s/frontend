import type { AuthErrorKey } from "./auth-rules";

/**
 * Retours du flux OAuth. Le backend (xauth, routes/oauth.py::callback) ne met dans l'adresse de retour qu'un CODE
 * d'une liste fermée (services/oauth.py : state_invalid, account_disabled, already_linked, provider_error…) :
 * jamais un texte. Un paramètre d'URL est de toute façon forgeable (`/app?link_error=<n'importe quoi>`), donc
 * rien de ce qui s'y trouve n'est affiché tel quel — un code inconnu retombe sur le message générique.
 */

/** Noms propres des fournisseurs, partagés entre les comptes liés et l'avis de retour. */
export const PROVIDER_NAMES: Record<string, string> = { google: "Google", microsoft: "Microsoft", github: "GitHub", discord: "Discord" };

/** Connexion (retour sur /auth) : code d'erreur du backend → clé de message de la page de connexion. */
export function loginErrorKey(code: string | null | undefined): AuthErrorKey {
  switch (code) {
    case "account_disabled":
      return "accountInactive";
    case "state_invalid":
      return "oauthExpired";
    default:
      return "oauth";
  }
}

const LINK_ERROR_CODES = ["already_linked", "state_invalid", "provider_error", "account_disabled"] as const;
export type LinkErrorCode = (typeof LINK_ERROR_CODES)[number] | "generic";

/** Liaison d'un fournisseur depuis un compte connecté : ce que le callback annonce au retour dans l'espace de travail. */
export type LinkResult = { status: "linked"; provider: string } | { status: "error"; code: LinkErrorCode };

const LINK_PARAMS = ["linked", "link_error"] as const;

/** `?linked=google` ou `?link_error=<code>` ; null si l'adresse n'en porte aucun (ou un fournisseur inconnu). */
export function parseLinkResult(params: URLSearchParams): LinkResult | null {
  const error = params.get("link_error");
  if (error !== null) {
    const code = LINK_ERROR_CODES.find((known) => known === error);
    return { status: "error", code: code ?? "generic" };
  }
  const provider = params.get("linked");
  if (provider !== null && Object.hasOwn(PROVIDER_NAMES, provider)) return { status: "linked", provider };
  return null;
}

/** La même adresse sans les paramètres de retour (l'avis n'a pas à revenir au rechargement). */
export function withoutLinkResult(url: URL): URL {
  const clean = new URL(url);
  for (const name of LINK_PARAMS) clean.searchParams.delete(name);
  return clean;
}
