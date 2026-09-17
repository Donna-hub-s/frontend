import "server-only";
import { cookies } from "next/headers";
import type { TenantInfo, TokenResponse } from "./backend";
import { COOKIES, MAX_AGE, cookieOptions } from "./session-cookies";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/** Session complète : jetons définitifs, étapes intermédiaires effacées. */
export function writeSession(store: CookieStore, tokens: Pick<TokenResponse, "access_token" | "refresh_token">) {
  store.set(COOKIES.access, tokens.access_token, cookieOptions(MAX_AGE.access));
  store.set(COOKIES.refresh, tokens.refresh_token, cookieOptions(MAX_AGE.refresh));
  for (const name of [COOKIES.pending, COOKIES.tenants, COOKIES.mfa]) store.delete(name);
}

/** Connexion réussie mais sans espace de travail résolu : on garde le refresh token de côté. */
export function writePending(store: CookieStore, refreshToken: string, tenants?: TenantInfo[] | null) {
  store.set(COOKIES.pending, refreshToken, cookieOptions(MAX_AGE.pending));
  if (tenants?.length) {
    const summary = tenants.map(({ id, name, slug, is_owner }) => ({ id, name, slug, is_owner }));
    store.set(COOKIES.tenants, JSON.stringify(summary), cookieOptions(MAX_AGE.pending));
  } else {
    store.delete(COOKIES.tenants);
  }
}

export function readTenants(store: CookieStore): TenantInfo[] {
  try {
    const parsed = JSON.parse(store.get(COOKIES.tenants)?.value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearSession(store: CookieStore) {
  for (const name of Object.values(COOKIES)) store.delete(name);
}
