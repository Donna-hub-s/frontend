/**
 * Messages poussés par le backend sur le canal websocket « user » (voir
 * backend/extensions/xwebsocket/ws.py::_encode : `{channel, action, payload}`, `action` en
 * majuscules). Isolé du hook pour rester testable sans navigateur.
 */

export type CapacityUpdate = { projectId: string; contextChunksUsed: number };

/** Statut à jour d'UN document précis (voir backend/app/rag/src/tasks.py::_publish_status "current"). */
export type DocumentStatusUpdate = {
  documentId: string;
  status: string;
  chunkCount: number;
  error: string | null;
};

/** Un rappel vient de se déclencher (backend/app/chat/src/reminder_notify_bridge.py::_notify_in_app). */
export type ReminderDue = {
  reminderId: string;
  /** Conversation où DONNA a posé le rappel (le message est déjà en base) ; null si elle n'existe plus. */
  conversationId: string | null;
  messageId: string | null;
  content: string;
};

/** Message de DONNA à l'utilisateur hors conversation (ex. briefing d'un workflow) — backend/app/chat/src/workflow_service.py::_deliver_app. */
export type AppNotification = {
  /** Message déposé dans la conversation du workflow (déjà en base). */
  messageId: string | null;
  conversationId: string | null;
  title: string;
  body: string;
};

/** DONNA vient d'écrire (retenir, corriger, oublier) dans la mémoire PARTAGÉE d'un projet (backend/app/chat/src/project_memory.py) : la carte « Mémoire » du projet se relit. */
export type MemoryChange = { projectId: string };

export type UserChannelEvent =
  | { kind: "capacity"; update: CapacityUpdate }
  | { kind: "memory"; change: MemoryChange }
  | { kind: "document"; update: DocumentStatusUpdate }
  | { kind: "reminder"; reminder: ReminderDue }
  | { kind: "notification"; notification: AppNotification };

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/** Décode un message du canal « user » ; renvoie [] pour tout ce qui est inconnu ou malformé. */
export function parseUserChannelMessage(raw: string): UserChannelEvent[] {
  let message: { action?: unknown; payload?: Record<string, unknown> | null };
  try {
    message = JSON.parse(raw) as typeof message;
  } catch {
    return [];
  }
  const payload = message?.payload;
  if (!payload || typeof payload !== "object") return [];

  if (message.action === "RAG_INGESTION_STATUS") {
    const events: UserChannelEvent[] = [];
    const projectId = text(payload.project_id);
    const chunkTotal = payload.project_chunk_total;
    if (projectId && typeof chunkTotal === "number") {
      events.push({ kind: "capacity", update: { projectId, contextChunksUsed: chunkTotal } });
    }
    const current = payload.current as { document_id?: unknown; status?: unknown; chunk_count?: unknown; error?: unknown } | undefined;
    const documentId = text(current?.document_id);
    const status = text(current?.status);
    if (documentId && status) {
      events.push({
        kind: "document",
        update: {
          documentId,
          status,
          chunkCount: typeof current?.chunk_count === "number" ? current.chunk_count : 0,
          error: typeof current?.error === "string" ? current.error : null,
        },
      });
    }
    return events;
  }

  if (message.action === "MEMORY_FACT_SAVED" || message.action === "MEMORY_FACT_UPDATED" || message.action === "MEMORY_FACT_FORGOTTEN") {
    // Seule la mémoire d'un PROJET intéresse la carte du projet ; un fait personnel n'y figure pas.
    const projectId = text(payload.project_id);
    return payload.scope === "project" && projectId ? [{ kind: "memory", change: { projectId } }] : [];
  }

  if (message.action === "REMINDER_DUE") {
    const reminderId = text(payload.reminder_id);
    const content = text(payload.content);
    if (!reminderId || !content) return [];
    return [
      {
        kind: "reminder",
        reminder: { reminderId, conversationId: text(payload.conversation_id), messageId: text(payload.message_id), content },
      },
    ];
  }

  if (message.action === "NOTIFICATION") {
    const title = text(payload.title);
    const body = text(payload.body);
    if (!title || !body) return [];
    return [
      { kind: "notification", notification: { messageId: text(payload.message_id), conversationId: text(payload.conversation_id), title, body } },
    ];
  }

  return [];
}
