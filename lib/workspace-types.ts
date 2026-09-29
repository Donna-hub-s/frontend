// Types partagés par les composants de l'espace de travail (navigateur).
import type {
  AttachmentOut,
  ConnectorsOut,
  ConversationOut,
  PendingActionOut,
  ProfileOut,
  ProjectDocumentOut,
  ProjectFactOut,
  ProjectInviteOut,
  ProjectMemberOut,
  ProjectOut,
  ProjectRole,
  SearchHitOut,
  SourceOut,
} from "./api";

export type {
  AttachmentOut,
  ConnectorsOut,
  ConversationOut,
  PendingActionOut,
  ProfileOut,
  ProjectDocumentOut,
  ProjectFactOut,
  ProjectInviteOut,
  ProjectMemberOut,
  ProjectOut,
  ProjectRole,
  SearchHitOut,
  SourceOut,
};

/** Clé de skill = nom d'un champ `enable_*` de ProfileOut (./api). */
export type SkillKey =
  | "enable_web_search"
  | "enable_sub_agents"
  | "enable_reminders"
  | "enable_memory"
  | "enable_email_calendar"
  | "enable_drive"
  | "enable_create_document";

/** Ordre d'affichage des skills. Vit ici et pas dans ./api : ce module est
 * côté navigateur, ./api est `server-only` (un réexport de valeur l'y
 * entraînerait). Les libellés sont dans les dictionnaires
 * (settings.skill.<clé>), voir settings-dialog.tsx. */
export const SKILL_KEYS: SkillKey[] = [
  "enable_web_search",
  "enable_memory",
  "enable_reminders",
  "enable_email_calendar",
  "enable_drive",
  "enable_create_document",
  "enable_sub_agents",
];

export type StepStatus = "running" | "done";

/** Étape visible du traitement : lecture, appel d'outil, rédaction. */
export type Step = {
  id: string;
  /** « read », « answer », « files », ou nom d'outil backend (search_emails, search_drive_files…). */
  key: string;
  status: StepStatus;
  at: number;
};

export type ToolCall = { name: string; arguments: Record<string, unknown>; result: string };

/** Document personnel (hors-projet) — backend/app/rag/src/schemas.py::DocumentOut,
 * GET /app/rag/documents (menu @ du composer, voir conversation.tsx). */
export type PersonalDocumentOut = {
  id: string;
  original_name: string;
  status: string;
  chunk_count: number;
  error: string | null;
  created_at: string;
};

/** Mention « @ » insérée dans le composer — voir conversation.tsx::detectTrigger.
 * `label` est le texte littéralement inséré (`@Nom`), utilisé pour savoir si la
 * mention est encore présente au moment d'envoyer (texte brut, pas de puce). */
export type MentionKind = "document" | "project";
export type Mention = { id: string; label: string; kind: MentionKind };
/** Ce qui part réellement dans la requête (ChatRequest.mentioned_document_ids/
 * mentioned_project_id) — un seul projet mentionné à la fois, comme le backend. */
export type MentionSelection = { documentIds: string[]; projectId: string | null };
export const EMPTY_MENTIONS: MentionSelection = { documentIds: [], projectId: null };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number | null;
  attachments: AttachmentOut[];
  /** Fichiers joints par l'utilisateur, en cours d'envoi (noms seulement). */
  localFiles?: string[];
  steps?: Step[];
  tools?: ToolCall[];
  sources?: SourceOut[];
  memory?: string[];
  status?: "streaming" | "done" | "stopped" | "error";
  error?: "generic" | "session" | "unavailable" | "tooMany";
};

/** Dates backend : datetime UTC sans fuseau (SQLite) ou ISO complet. */
export function parseBackendDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(value);
  const time = Date.parse(hasZone ? value : `${value}Z`);
  return Number.isNaN(time) ? null : time;
}

/** URL d'un fichier backend (/app/…) servie par la passerelle /api/donna/…. */
export const fileHref = (fileUrl: string) => fileUrl.replace(/^\/app\//, "/api/donna/");

/** sessionStorage : message tapé sur la page projet (project-detail.tsx), consommé
 * une fois par la nouvelle conversation (conversation.tsx) dès son montage. */
export const PROJECT_DRAFT_KEY = "donna:project-draft";
