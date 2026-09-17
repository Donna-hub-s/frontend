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
} as const;

export const MAX_AGE = {
  access: 15 * 60,
  refresh: 7 * 24 * 60 * 60,
  pending: 30 * 60,
  mfa: 5 * 60,
} as const;

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});
