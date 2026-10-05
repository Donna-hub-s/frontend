import "server-only";
import { cookies } from "next/headers";
import { BACKEND_URL } from "./backend";
import { COOKIES } from "./session-cookies";
import type { ResearchDraft } from "./research";

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

export type SourceOut = { doc_id: string; original_name: string; excerpt: string; file_url: string; rerank_score?: number | null; is_project_doc?: boolean };

/** backend/app/chat/src/schemas.py::AttachedFileOut — ce qui a été lu de chaque fichier joint. */
export type AttachedFileOut = {
  filename: string;
  kind: "document" | "image" | "audio" | string;
  chars: number;
  kept_chars: number;
  /** Texte plus long que sa part du budget : la suite n'a pas été transmise au modèle. */
  truncated: boolean;
};

/** backend/app/chat/src/schemas.py::RagInfoOut — issue de la lecture documentaire d'un tour. */
export type RagInfoOut = {
  status: "completed" | "empty" | "skipped" | "failed";
  scope: "project" | "personal";
  sources_count: number;
  documents_count: number;
  indexed_documents: number;
  reranked: boolean;
  error: "index_mismatch" | "embeddings_auth" | "unavailable" | null;
};

/** backend/app/chat/src/schemas.py::AccessibleDocumentOut — GET /app/chat/documents. */
export type AccessibleDocumentOut = {
  id: string;
  original_name: string;
  status: string;
  chunk_count: number;
  project_id: string | null;
  project_name: string | null;
  /** Fichier joint à une conversation (visible de son seul propriétaire). */
  conversation_id: string | null;
  conversation_title: string | null;
  created_at: string;
};

/** backend/app/chat/src/schemas.py::DocumentSearchOut — GET /app/chat/search/documents. */
export type DocumentHitOut = {
  doc_id: string;
  original_name: string;
  project_id: string | null;
  project_name: string | null;
  conversation_id: string | null;
  conversation_title: string | null;
  excerpt: string;
  file_url: string;
  score: number | null;
  matched_in: "name" | "content" | "semantic";
};
export type DocumentSearchOut = {
  hits: DocumentHitOut[];
  mode: "hybrid" | "keyword" | "unavailable";
  warning: RagInfoOut["error"];
};

export type ConversationOut = {
  id: string;
  title: string;
  created_at: string | null;
  // Absents des mises à jour optimistes locales (voir conversation.tsx::upsertConversation) —
  // toujours présents quand la donnée vient du backend (GET /app/chat/).
  project_id?: string | null;
  /** Agent du projet choisi pour cette conversation (null/absent = DONNA seule). */
  agent_id?: string | null;
  updated_at?: string;
};

export type ToolCallOut = { name: string; arguments: Record<string, unknown>; result: string };

export type MessageOut = {
  /** Identifiant serveur du message (permet de le noter). */
  id?: string | null;
  /** Mon pouce sur cette réponse. */
  feedback?: "up" | "down" | null;
  role: "user" | "assistant" | string;
  content: string;
  created_at: string | null;
  attachments: AttachmentOut[];
  // Reconstruit ask_user/propose_email/propose_calendar_event en cartes —
  // sans ça une conversation rechargée (F5, réouverture) ne montre plus que
  // le texte brut de ces réponses (voir ANALYSE_COMPLETE.md §3.2).
  tool_calls?: ToolCallOut[] | null;
  // Versions de ce message (édition d'un message utilisateur, régénération d'une
  // réponse) — backend/app/chat/src/schemas.py::MessageOut.sibling_ids/sibling_index.
  // Un seul élément (ou absent) = une seule version, rien à afficher.
  sibling_ids?: string[];
  sibling_index?: number;
};

/** backend/app/chat/src/schemas.py::EmailDraftOut — le brouillon RÉEL d'un email en attente. */
export type EmailAttachmentOut = { name: string; size: number; mime_type: string; source: "conversation" | "drive" | string };
export type EmailDraftOut = { to: string; subject: string; body: string; attachments: EmailAttachmentOut[] };
/** GET /app/chat/models (backend/app/chat/src/schemas.py::ModelOut). */
export type ModelOut = {
  id: string;
  /** eco | balanced | premium | free. */
  tier: string;
  label: string;
  provider: string;
  model: string;
  /** $ par million de tokens ; null = tarif propre au fournisseur (non affiché). */
  price_in: number | null;
  price_out: number | null;
  context: number | null;
  /** Accepte un effort de raisonnement. */
  reasoning: boolean;
  vision: boolean;
  recommended: boolean;
};

export type ModelsOut = { models: ModelOut[]; efforts: string[]; default_provider: string };

/** GET /app/chat/{id}/context et POST /app/chat/{id}/compact (backend/app/chat/src/schemas.py::ContextStatusOut). */
export type ContextStatusOut = {
  total_messages: number;
  /** Messages déjà condensés dans le résumé de la conversation. */
  covered_messages: number;
  /** Messages encore envoyés en clair au modèle. */
  recent_messages: number;
  summary_chars: number;
  /** Part du budget de contexte utilisée (0 à 100). */
  context_budget_used_pct: number;
  compacted: boolean;
};

/** Automatisation proposée par DONNA (kind "workflow") : nom, déclencheur puis une ligne par étape. */
export type WorkflowDraftOut = { name: string; lines: string[]; /** Agents de projet que ce workflow fige (id + version). */ agent_refs?: { id: string; version: number }[] };

/** GET /app/workflows (backend/app/workflows/src/schemas.py::WorkflowOut). */
export type WorkflowOut = {
  id: string;
  name: string;
  description: string | null;
  /** draft (jamais approuvé ou modifié depuis) | active | paused. */
  status: "draft" | "active" | "paused" | string;
  /** user | template | donna (proposé par DONNA puis approuvé). */
  origin: string;
  definition: Record<string, unknown>;
  /** La définition courante est celle que l'utilisateur a approuvée. */
  approved: boolean;
  /** Déclencheur en clair. */
  schedule: string;
  /** Ce que l'utilisateur approuve : le déclencheur puis une ligne par étape. */
  lines: string[];
  next_run_at: string | null;
  last_run_at: string | null;
  max_runs_per_day: number;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowStepRunOut = {
  position: number;
  step_id: string;
  type: string;
  /** succeeded | failed | skipped (étape facultative indisponible). */
  status: string;
  output: string | null;
  error: string | null;
  /** Étape « agent » : les outils que DONNA a appelés, dans l'ordre (arguments et début du résultat). */
  detail?: ToolTraceOut[] | null;
};

export type ToolTraceOut = { name: string; arguments: unknown; result: string };

export type WorkflowRunOut = {
  id: string;
  /** running | succeeded | failed | skipped. */
  status: string;
  /** schedule | manual. */
  trigger: string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  steps: WorkflowStepRunOut[];
};

export type PendingActionOut = {
  id: string;
  kind: string;
  summary: string;
  status: string;
  created_at: string;
  /** Brouillon d'email (kind « send_email ») : destinataire, objet, corps et pièces jointes. */
  email?: EmailDraftOut | null;
  /** Automatisation proposée (kind « workflow ») : ce que l'utilisateur va approuver. */
  workflow?: WorkflowDraftOut | null;
  /** Recherche approfondie proposée (kind « research ») : sujet, estimation de coût et plafond. */
  research?: ResearchDraft | null;
};

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
  /** Locuteur d'une voix multi-locuteurs (upmc : 2, mls : 125) ; null = celui du modèle. */
  preferred_tts_speaker: number | null;
  /** Voix des bouts anglais (chat/src/tts.py::lingual_spans) ; null = celle du serveur. */
  preferred_tts_english_voice: string | null;
  default_force_web_search: boolean;
  notify_reminders_email: boolean;
  notify_reminders_whatsapp: boolean;
  whatsapp_notify_number: string | null;
  theme: string;
  date_format: string;
  measurement_system: string;
  /** Réglages EXPLICITES par skill ({identifiant: activée}) ; une skill absente garde sa valeur par
   * défaut (voir SkillOut). Une skill désactivée retire ses outils au modèle ; ne peut qu'enlever,
   * jamais accorder (les droits viennent de xauth). */
  skills: Record<string, boolean>;
  created_at: string;
  updated_at: string;
};

/** GET /app/chat/skills (backend/app/chat/src/routes/skill_routes.py::SkillOut). */
export type SkillOut = {
  id: string;
  /** Textes par langue ({fr, en}). */
  label: Record<string, string>;
  description: Record<string, string>;
  tools: string[];
  /** Ce que la skill peut provoquer : lecture seule, écriture chez l'utilisateur, ou envoi vers un tiers. */
  risk: "read" | "write" | "outbound";
  default_enabled: boolean;
  /** Connecteurs nécessaires (gmail, calendar, drive) et ceux que l'utilisateur n'a pas accordés. */
  requires: string[];
  missing: string[];
};

export type ProjectRole = "owner" | "editor" | "viewer";

/** backend/app/chat/src/schemas.py::ProjectOut. */
export type ProjectOut = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  icon: string | null;
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

export type ProjectFactOut = {
  id: string;
  fact: string;
  created_by: string;
  created_at: string;
  version: number;
  updated_by: string | null;
  updated_at: string | null;
};

/** backend/app/chat/src/schemas.py::ProjectDocumentOut. */
export type ProjectDocumentOut = {
  id: string;
  original_name: string;
  status: string;
  chunk_count: number;
  error: string | null;
  created_at: string;
};

/** backend/app/chat/src/schemas.py::ProjectDocumentBatchOut — fichiers ajoutés ET refusés. */
export type ProjectDocumentBatchOut = {
  documents: ProjectDocumentOut[];
  errors: { filename: string; detail: string }[];
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

/** GET /app/chat/voices — catalogue des voix + voix réellement installées (backend/app/chat/src/schemas.py::VoiceOut). */
export type VoiceOut = {
  name: string;
  language: string;
  /** Indication saisie à la main : Piper ne publie pas de métadonnée de genre. */
  gender: "f" | "m" | "mf" | "?";
  speakers: number;
  sample_rate: number | null;
  installed: boolean;
  default: boolean;
  default_english: boolean;
  note: string;
};

export const listVoices = async () => (await getJson<VoiceOut[]>("/app/chat/voices")) ?? [];

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
