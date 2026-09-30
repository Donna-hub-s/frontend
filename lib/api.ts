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

export type ConversationOut = {
  id: string;
  title: string;
  created_at: string | null;
  // Absents des mises à jour optimistes locales (voir conversation.tsx::upsertConversation) —
  // toujours présents quand la donnée vient du backend (GET /app/chat/).
  project_id?: string | null;
  updated_at?: string;
};

export type ToolCallOut = { name: string; arguments: Record<string, unknown>; result: string };

export type MessageOut = {
  role: "user" | "assistant" | string;
  content: string;
  created_at: string | null;
  attachments: AttachmentOut[];
  // Reconstruit ask_user/propose_email/propose_calendar_event en cartes —
  // sans ça une conversation rechargée (F5, réouverture) ne montre plus que
  // le texte brut de ces réponses (voir ANALYSE_COMPLETE.md §3.2).
  tool_calls?: ToolCallOut[] | null;
};

export type PendingActionOut = { id: string; kind: string; summary: string; status: string; created_at: string };

/** GET /app/chat/memory/reminders (backend/app/chat/src/schemas.py::ReminderOut). */
export type ReminderOut = { id: string; content: string; status: string; due_at: string | null; created_at: string };

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

/** GET/PATCH /app/profile/me (backend/app/profile/src/schemas.py::ProfileOut). */
export type ProfileOut = {
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  language: string | null;
  preferred_llm_provider: string | null;
  preferred_tts_voice: string | null;
  default_force_web_search: boolean;
  notify_reminders_email: boolean;
  notify_reminders_whatsapp: boolean;
  whatsapp_notify_number: string | null;
  theme: string;
  date_format: string;
  measurement_system: string;
  /** Skills activables — clés alignées sur `_SKILL_TOOLS`
   * (backend/app/chat/src/tools.py). Une skill désactivée retire ses outils
   * au modèle ; ne peut qu'enlever, jamais accorder (les droits viennent de
   * xauth). Toutes vraies par défaut. */
  enable_web_search: boolean;
  enable_sub_agents: boolean;
  enable_reminders: boolean;
  enable_memory: boolean;
  enable_email_calendar: boolean;
  enable_drive: boolean;
  enable_create_document: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectRole = "owner" | "editor" | "viewer";

/** backend/app/chat/src/schemas.py::ProjectOut. */
export type ProjectOut = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  conversations_count: number;
  member_count: number;
  document_count: number;
  context_chunks_used: number;
  context_chunks_limit: number;
  my_role: ProjectRole | null;
  created_at: string;
  updated_at: string;
};

export type ProjectMemberOut = { user_id: string; email: string | null; role: ProjectRole; invited_by: string; joined_at: string };

export type ProjectInviteOut = {
  id: string;
  project_id: string;
  email: string;
  role: ProjectRole;
  status: string;
  expires_at: string;
  created_at: string;
  token: string | null;
};

export type ProjectFactOut = { id: string; fact: string; created_by: string; created_at: string };

/** backend/app/chat/src/schemas.py::ProjectDocumentOut. */
export type ProjectDocumentOut = {
  id: string;
  original_name: string;
  status: string;
  chunk_count: number;
  error: string | null;
  created_at: string;
};

export const listConversations = async (projectId?: string) =>
  (await getJson<ConversationOut[]>(`/app/chat/${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`)) ?? [];

export const getMessages = (conversationId: string) =>
  getJson<MessageOut[]>(`/app/chat/${encodeURIComponent(conversationId)}/messages`);

export const listPendingActions = async () => (await getJson<PendingActionOut[]>("/app/chat/memory/actions")) ?? [];

export const listLinkedAccounts = async () => (await getJson<LinkedAccount[]>("/app/auth/oauth/me/accounts")) ?? [];

export const getConnectors = () => getJson<ConnectorsOut>("/app/chat/connectors");

export const getMe = () => getJson<{ id: string; email: string }>("/app/auth/me");

export const getTenant = (tenantId: string) => getJson<TenantOut>(`/app/auth/tenants/${encodeURIComponent(tenantId)}`);

export const getProfile = () => getJson<ProfileOut>("/app/profile/me");

export const listProjects = async () => (await getJson<ProjectOut[]>("/app/chat/projects")) ?? [];

export const getProject = (projectId: string) => getJson<ProjectOut>(`/app/chat/projects/${encodeURIComponent(projectId)}`);

export const listProjectMembers = async (projectId: string) =>
  (await getJson<ProjectMemberOut[]>(`/app/chat/projects/${encodeURIComponent(projectId)}/members`)) ?? [];

export const listProjectInvites = async (projectId: string) =>
  (await getJson<ProjectInviteOut[]>(`/app/chat/projects/${encodeURIComponent(projectId)}/invites`)) ?? [];

export const listProjectFacts = async (projectId: string) =>
  (await getJson<ProjectFactOut[]>(`/app/chat/projects/${encodeURIComponent(projectId)}/memory/facts`)) ?? [];

export const listProjectDocuments = async (projectId: string) =>
  (await getJson<ProjectDocumentOut[]>(`/app/chat/projects/${encodeURIComponent(projectId)}/documents`)) ?? [];
