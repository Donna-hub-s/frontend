import "server-only";
import { cookies } from "next/headers";
import { BACKEND_URL } from "./backend";
import { COOKIES } from "./session-cookies";

/**
 * Lectures côté serveur (Server Components) vers l'API DONNA, avec le jeton de la session.
 * Le renouvellement du jeton a lieu dans proxy.ts avant le rendu ; ici un 401 renvoie simplement null.
 */
async function getJson<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(COOKIES.access)?.value;
  if (!token) return null;
  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Contenu du JWT xauth (non vérifié ici : affichage uniquement, le backend vérifie chaque appel). */
export type Claims = { sub: string; email?: string; tenant_id?: string; roles?: string[]; permissions?: string[] };

export async function getClaims(): Promise<Claims | null> {
  const token = (await cookies()).get(COOKIES.access)?.value;
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
  } catch {
    return null;
  }
}

/* ── Contrats (backend/app/chat/src/schemas.py) ───────────────────────────────── */

export type AttachmentOut = {
  id: string;
  kind: string;
  original_name: string;
  mime_type: string;
  file_url: string;
  created_at: string;
};

export type SourceOut = { doc_id: string; original_name: string; excerpt: string; file_url: string };

export type ConversationOut = { id: string; title: string; created_at: string | null };

export type MessageOut = {
  role: "user" | "assistant" | string;
  content: string;
  created_at: string | null;
  attachments: AttachmentOut[];
};

export type PendingActionOut = { id: string; kind: string; summary: string; status: string; created_at: string };

export type LinkedAccount = {
  provider: string;
  provider_email: string;
  provider_name: string | null;
  provider_avatar: string | null;
  linked_at: string;
};

export type TenantOut = { id: string; name: string; slug: string };

/** GET /app/chat/connectors (backend/app/chat/src/routes/connectors_routes.py). */
export type ConnectorsOut = {
  google: { connected: boolean; gmail: boolean; calendar: boolean; drive: boolean; detail: string };
  whatsapp: { enabled: boolean; available: boolean; paired: boolean; online: boolean };
  llm_provider: string;
};

export type SearchHitOut = {
  conversation_id: string;
  title: string;
  created_at: string | null;
  matched_in: "title" | "message";
  snippet: string;
};

export const listConversations = async () => (await getJson<ConversationOut[]>("/app/chat/")) ?? [];

export const getMessages = (conversationId: string) =>
  getJson<MessageOut[]>(`/app/chat/${encodeURIComponent(conversationId)}/messages`);

export const listPendingActions = async () => (await getJson<PendingActionOut[]>("/app/chat/memory/actions")) ?? [];

export const listLinkedAccounts = async () => (await getJson<LinkedAccount[]>("/app/auth/oauth/me/accounts")) ?? [];

export const getConnectors = () => getJson<ConnectorsOut>("/app/chat/connectors");

export const getMe = () => getJson<{ id: string; email: string }>("/app/auth/me");

export const getTenant = (tenantId: string) => getJson<TenantOut>(`/app/auth/tenants/${encodeURIComponent(tenantId)}`);
