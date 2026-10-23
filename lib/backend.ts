import "server-only";

/**
 * Appels au backend DONNA (xcore) depuis le serveur Next uniquement.
 * Le navigateur ne parle jamais directement à l'API d'authentification :
 * les jetons restent côté serveur, dans des cookies httpOnly (voir lib/session.ts).
 */
export const BACKEND_URL = (process.env.DONNA_API_URL ?? "http://localhost:8080").replace(/\/$/, "");
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
  /** Identité de l'appareil émise (ou reconnue) par le serveur — voir COOKIES.device. */
  device_id?: string | null;
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

/** Aperçu public d'une invitation projet (pas d'auth requise, comme oauth/providers). */
export type ProjectInvitePreview = { project_name: string; email: string; role: string; status: string; space_invite_token?: string | null };

export async function getInvitePreview(token: string): Promise<ProjectInvitePreview | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/app/chat/projects/invites/${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? ((await response.json()) as ProjectInvitePreview) : null;
  } catch {
    return null;
  }
}

/** Aperçu public d'une invitation à un espace (backend/app/xauth/src/schemas/invite.py::InvitePreview) —
 * pas de "status" détaillé côté backend, juste `valid` (actif, non utilisé, non expiré). */
export type WorkspaceInvitePreview = { tenant_name: string; email: string; expires_at: string; valid: boolean };

export async function getWorkspaceInvitePreview(token: string): Promise<WorkspaceInvitePreview | null> {
  try {
    const response = await fetch(`${AUTH_BASE}/invites/token/${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? ((await response.json()) as WorkspaceInvitePreview) : null;
  } catch {
    return null;
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
