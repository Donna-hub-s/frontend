// Types partagés par les composants de l'espace de travail (navigateur).
import type {
  AccessibleDocumentOut,
  AttachedFileOut,
  AttachmentOut,
  ConnectorsOut,
  ContextStatusOut,
  ModelOut,
  ModelsOut,
  ConversationOut,
  DocumentHitOut,
  DocumentSearchOut,
  EmailAttachmentOut,
  EmailDraftOut,
  MessageOut,
  PendingActionOut,
  ProfileOut,
  ProjectDocumentBatchOut,
  ProjectDocumentOut,
  ProjectFactOut,
  ProjectInviteOut,
  ProjectMemberOut,
  ProjectOut,
  ProjectRole,
  RagInfoOut,
  ReminderOut,
  SearchHitOut,
  SkillOut,
  SourceOut,
  WorkflowDraftOut,
  WorkflowOut,
  WorkflowRunOut,
  WorkflowStepRunOut,
} from "./api";

export type {
  AccessibleDocumentOut,
  AttachedFileOut,
  AttachmentOut,
  ConnectorsOut,
  ContextStatusOut,
  ModelOut,
  ModelsOut,
  ConversationOut,
  DocumentHitOut,
  DocumentSearchOut,
  EmailAttachmentOut,
  EmailDraftOut,
  MessageOut,
  PendingActionOut,
  ProfileOut,
  ProjectDocumentBatchOut,
  ProjectDocumentOut,
  ProjectFactOut,
  ProjectInviteOut,
  ProjectMemberOut,
  ProjectOut,
  ProjectRole,
  RagInfoOut,
  ReminderOut,
  SearchHitOut,
  SkillOut,
  SourceOut,
  WorkflowDraftOut,
  WorkflowOut,
  WorkflowRunOut,
  WorkflowStepRunOut,
};

export type StepStatus = "running" | "done";

/** Étape visible du traitement : lecture, appel d'outil, rédaction. */
export type Step = {
  id: string;
  /** « read », « answer », « files », ou nom d'outil backend (search_emails, search_drive_files…). */
  key: string;
  status: StepStatus;
  at: number;
  /** Résultat structuré de l'étape (RAG, reclassement, mentions, projet, mémoire) — voir stepDetail. */
  data?: StepData;
};

/** Issue d'une tâche de préparation du contexte, annoncée par le backend (événement SSE « step »). */
export type StepData =
  | { kind: "rag"; info: RagInfoOut }
  | { kind: "rerank"; count: number | null; failed?: boolean }
  | { kind: "documents"; names: string[] }
  | { kind: "project"; name: string; instructions: boolean; facts: number }
  | { kind: "memory"; facts: number }
  | { kind: "files"; files: AttachedFileOut[] }
  | { kind: "convfiles"; names: string[]; pending: number };

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
/** `projectId` : pour un document, projet auquel il appartient (null = document personnel) —
 * mentionner un document de projet cadre le tour sur ce projet (voir conversation.tsx::submit). */
export type Mention = { id: string; label: string; kind: MentionKind; projectId?: string | null };
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
  /** Lecture de la base documentaire de ce tour (extraits injectés, aucun résultat, ou panne). */
  rag?: RagInfoOut;
  memory?: string[];
  status?: "streaming" | "done" | "stopped" | "error";
  /** Identifiant du message côté serveur (absent tant qu'il n'est pas enregistré) : nécessaire pour le noter. */
  serverId?: string;
  /** Mon pouce sur cette réponse. */
  feedback?: "up" | "down" | null;
  error?: "generic" | "session" | "unavailable" | "tooMany";
  /** Raison renvoyée par le serveur pour un refus actionnable (fichier trop gros, type refusé…). */
  errorDetail?: string;
  /** Versions de ce message (édition d'un message utilisateur, régénération d'une
   * réponse) — voir lib/branches.ts::nextSiblings. Absent/longueur ≤ 1 = rien à afficher. */
  siblingIds?: string[];
  siblingIndex?: number;
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

/** Borne des consignes de projet. Elle vit ICI, pas dans lib/api.ts : api.ts importe « server-only » et
 *  workspace-types est lu par des composants clients et par des tests purs — un simple réexport l'aurait cassé.
 *  Doit suivre backend/app/chat/src/schemas.py::PROJECT_INSTRUCTIONS_MAX (le serveur refuse au-delà : le compteur du
 *  formulaire n'est qu'un confort, pas la garantie). */
export const PROJECT_INSTRUCTIONS_MAX = 4000;

/** Historique backend (GET .../messages ou POST .../messages/{id}/select) → bulles du fil.
 * Pure (aucune I/O) : utilisée au chargement serveur ET après un changement de branche côté client. */
export const toChatMessages = (messages: MessageOut[]): ChatMessage[] =>
  messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m, index) => {
      const tools = m.tool_calls ?? undefined;
      const at = parseBackendDate(m.created_at) ?? 0;
      return {
        id: `h${index}`,
        serverId: m.id ?? undefined,
        feedback: m.feedback ?? null,
        role: m.role as ChatMessage["role"],
        content: m.content,
        createdAt: parseBackendDate(m.created_at),
        attachments: m.attachments,
        tools,
        // Rejoue les outils appelés comme des étapes « terminées » : sans ça, la carte
        // d'activité (StepsCard) disparaît après un rechargement — elle ne vivait que
        // pendant le direct — alors que les outils eux-mêmes, persistés, sont bien là.
        // Pas d'horodatage individuel conservé : toutes reprennent celui du message.
        steps: tools?.length ? tools.map((tool, i) => ({ id: `h${index}-step-${i}`, key: tool.name, status: "done" as const, at })) : undefined,
        status: "done" as const,
        siblingIds: (m.sibling_ids?.length ?? 0) > 1 ? m.sibling_ids : undefined,
        siblingIndex: m.sibling_index,
      };
    });

/** sessionStorage : message tapé sur la page projet (project-detail.tsx), consommé
 * une fois par la nouvelle conversation (conversation.tsx) dès son montage. */
export const PROJECT_DRAFT_KEY = "donna:project-draft";
