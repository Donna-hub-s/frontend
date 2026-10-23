/**
 * Noms et durées des cookies de session — partagés par proxy.ts, les Server Actions
 * et les Route Handlers. Tous httpOnly : aucun jeton n'est lisible par le JavaScript de la page.
 */
export const COOKIES = {
  /** Jeton d'accès xauth (JWT, 15 min). */
  access: "donna_access",
  /** Jeton de rafraîchissement xauth (7 jours). */
  refresh: "donna_refresh",
  /** Refresh token sans espace de travail choisi ou créé (création d'espace, choix d'espace). */
  pending: "donna_pending",
  /** Espaces proposés au choix après connexion (noms uniquement, jamais de jeton). */
  tenants: "donna_tenants",
  /** Jeton MFA à usage unique entre le mot de passe et le code (5 min). */
  mfa: "donna_mfa",
  /**
   * Identité de l'appareil, émise par le serveur et renvoyée à chaque connexion.
   *
   * Un cookie plutôt que le stockage local, et `httpOnly` comme les autres : le JavaScript
   * de la page ne peut donc pas la lire, ce qui prive une faille XSS du moyen de se faire
   * passer pour un appareil déjà connu — et donc d'esquiver l'alerte « nouvel appareil ».
   *
   * Ce n'est PAS un jeton : elle n'authentifie rien, elle étiquette. Le serveur ne la
   * reconnaît que parmi les sessions du compte qui se connecte.
   */
  device: "donna_device",
} as const;

export const MAX_AGE = {
  access: 15 * 60,
  refresh: 7 * 24 * 60 * 60,
  pending: 30 * 60,
  mfa: 5 * 60,
  // 400 jours : le maximum que Chrome accepte de conserver pour un cookie. Au-delà, il le
  // ramène silencieusement à cette valeur — autant la demander explicitement.
  device: 400 * 24 * 60 * 60,
} as const;

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});
