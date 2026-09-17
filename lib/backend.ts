import "server-only";

/**
 * Appels au backend DONNA (xcore) depuis le serveur Next uniquement.
 * Le navigateur ne parle jamais directement à l'API d'authentification :
 * les jetons restent côté serveur, dans des cookies httpOnly (voir lib/session.ts).
 */
export const BACKEND_URL = (process.env.DONNA_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const AUTH_BASE = `${BACKEND_URL}/app/auth`;

/** Reflète xauth TokenResponse (backend/app/xauth/src/schemas/auth.py). */
export type TenantInfo = {
  id: string;
  name: string | null;
  slug: string | null;
  is_owner: boolean;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  user_id?: string | null;
  tenant_id?: string | null;
  mfa_required: boolean;
  mfa_token?: string | null;
  needs_tenant_setup: boolean;
  tenants?: TenantInfo[] | null;
};

export type BackendResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; detail: string };

/** POST JSON. status 0 = backend injoignable (réseau, arrêt, délai dépassé). */
export async function postJson<T>(url: string, body: unknown, ip?: string | null): Promise<BackendResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // xauth journalise l'IP d'origine (audit, sessions) : on relaie celle du navigateur.
        ...(ip ? { "x-forwarded-for": ip } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) return { ok: true, status: response.status, data: payload as T };
    const detail = typeof payload?.detail === "string" ? payload.detail : "";
    return { ok: false, status: response.status, detail };
  } catch {
    return { ok: false, status: 0, detail: "" };
  }
}

/** Fournisseurs OAuth réellement configurés côté backend ; liste vide si l'API ne répond pas. */
export async function getOAuthProviders(): Promise<string[]> {
  try {
    const response = await fetch(`${AUTH_BASE}/oauth/providers`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return [];
    const { providers } = (await response.json()) as { providers?: unknown };
    return Array.isArray(providers) ? providers.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}
