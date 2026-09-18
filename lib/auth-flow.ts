import "server-only";
import { cookies, headers } from "next/headers";
import type { Locale } from "@/i18n/config";
import type { BackendResult, TokenResponse } from "./backend";
import type { AuthErrorKey } from "./auth-rules";
import { writePending, writeSession } from "./session";
import { COOKIES, MAX_AGE, cookieOptions } from "./session-cookies";

/** IP du navigateur, relayée au backend pour son journal d'audit et ses limites de débit. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Erreurs communes à tous les appels : backend arrêté, limite de débit, panne. */
export function commonError(result: Extract<BackendResult<unknown>, { ok: false }>): AuthErrorKey | null {
  if (result.status === 0 || result.status >= 500) return "unavailable";
  if (result.status === 429) return "tooMany";
  return null;
}

/** Cible de retour après connexion : une page de l'application, ou l'aperçu
 * d'une invitation projet (voir app/[lang]/projects/invites/[token]/page.tsx),
 * toujours dans la même langue. */
export function safeNext(lang: Locale, next: unknown): string {
  const home = `/${lang}/app`;
  const allowedPrefixes = [home, `/${lang}/projects/invites`];
  if (typeof next !== "string") return home;
  return allowedPrefixes.some((prefix) => next === prefix || next.startsWith(`${prefix}/`) || next.startsWith(`${prefix}?`))
    ? next
    : home;
}

/**
 * Traduit une réponse xauth en étape suivante et pose les cookies correspondants.
 * Renvoie le chemin où rediriger, ou « mfa » quand un code est encore attendu.
 */
export async function applyTokens(tokens: TokenResponse, lang: Locale, next?: unknown): Promise<string | "mfa"> {
  const store = await cookies();
  if (tokens.mfa_required && tokens.mfa_token) {
    store.set(COOKIES.mfa, tokens.mfa_token, cookieOptions(MAX_AGE.mfa));
    return "mfa";
  }
  if (tokens.access_token) {
    writeSession(store, tokens);
    return safeNext(lang, next);
  }
  if (tokens.refresh_token && tokens.tenants?.length) {
    writePending(store, tokens.refresh_token, tokens.tenants);
    return `/${lang}/workspaces`;
  }
  if (tokens.refresh_token) {
    writePending(store, tokens.refresh_token);
    return `/${lang}/welcome`;
  }
  return `/${lang}/login?error=generic`;
}

/** Identifiant d'espace : nom lisible + suffixe aléatoire (le slug est unique côté backend). */
export function workspaceSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 6);
  return `${base || "espace"}-${suffix}`;
}
