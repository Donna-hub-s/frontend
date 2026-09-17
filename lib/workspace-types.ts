// Types partagés par les composants de l'espace de travail (navigateur).
import type { AttachmentOut, ConnectorsOut, ConversationOut, PendingActionOut, SearchHitOut, SourceOut } from "./api";

export type { AttachmentOut, ConnectorsOut, ConversationOut, PendingActionOut, SearchHitOut, SourceOut };

export type StepStatus = "running" | "done";

/** Étape visible du traitement : lecture, appel d'outil, rédaction. */
export type Step = {
  id: string;
  /** « read », « answer », « files », ou nom d'outil backend (search_emails, wa_send…). */
  key: string;
  status: StepStatus;
  at: number;
};

export type ToolCall = { name: string; arguments: Record<string, unknown>; result: string };

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
