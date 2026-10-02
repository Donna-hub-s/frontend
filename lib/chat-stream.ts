// Lecture du flux SSE de POST /app/chat/stream (backend/app/chat/src/routes/chat_routes.py::event_stream).
// fetch + ReadableStream plutôt qu'EventSource : la requête est un POST avec corps JSON.
import type { AttachmentOut, RagInfoOut, SourceOut, ToolCall } from "./workspace-types";

/** backend/app/chat/src/routes/chat_routes.py::_prepare_llm_context(on_step) — progression réelle de la préparation. */
export type PrepStep = {
  key: string;
  status: "running" | "done" | "failed";
  scope?: "project" | "personal";
  info?: RagInfoOut;
  count?: number | null;
  names?: string[];
  pending?: number;
  name?: string;
  instructions?: boolean;
  facts?: number;
};

export type StreamEvent =
  | { type: "start"; conversationId: string }
  | { type: "delta"; content: string }
  | { type: "tool_start"; name: string }
  | { type: "step"; step: PrepStep }
  | { type: "sources"; sources: SourceOut[] }
  | { type: "tool_call"; call: ToolCall }
  | { type: "fallback" }
  | { type: "error"; message: string }
  | { type: "done"; sources: SourceOut[]; memory: string[]; attachments: AttachmentOut[] };

function parseBlock(block: string): StreamEvent | null {
  let name = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (!data.length) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data.join("\n"));
  } catch {
    return null;
  }
  switch (name) {
    case "start":
      return { type: "start", conversationId: String(payload.conversation_id ?? "") };
    case "message":
      return typeof payload.delta === "string" ? { type: "delta", content: payload.delta } : null;
    case "tool_start":
      return { type: "tool_start", name: String(payload.name ?? "") };
    case "step":
      return typeof payload.key === "string" ? { type: "step", step: payload as unknown as PrepStep } : null;
    case "sources":
      return { type: "sources", sources: (payload.sources as SourceOut[]) ?? [] };
    case "tool_call":
      return {
        type: "tool_call",
        call: {
          name: String(payload.name ?? ""),
          arguments: (payload.arguments as Record<string, unknown>) ?? {},
          result: String(payload.result ?? ""),
        },
      };
    case "provider_fallback":
      return { type: "fallback" };
    case "error":
      return { type: "error", message: String(payload.error ?? "") };
    case "done":
      return {
        type: "done",
        sources: (payload.sources as SourceOut[]) ?? [],
        memory: (payload.memory_notes as string[]) ?? [],
        attachments: (payload.attachments as AttachmentOut[]) ?? [],
      };
    default:
      return null;
  }
}

/** Itère sur les événements d'une réponse SSE ; s'arrête à la fin du flux ou à l'abandon. */
export async function* readChatStream(response: Response): AsyncGenerator<StreamEvent> {
  if (!response.body) return;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value.replace(/\r\n/g, "\n");
      let index: number;
      while ((index = buffer.indexOf("\n\n")) !== -1) {
        const event = parseBlock(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
        if (event) yield event;
      }
    }
    if (buffer.trim()) {
      const event = parseBlock(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Identifiant d'action en attente dans le résultat de propose_email / propose_calendar_event. */
export function actionIdFrom(result: string): string | null {
  return result.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;
}
