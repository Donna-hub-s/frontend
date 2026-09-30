import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_MENTIONS, startChatRun, uid } from "./chat-run";
import type { ChatMessage } from "./workspace-types";

/** Construit une réponse SSE telle que backend/app/chat/src/routes/chat_routes.py
 * (event_stream) la produit — mêmes noms d'événement, même format `event: x\ndata: {...}\n\n`. */
function sseResponse(blocks: string[]): Response {
  const body = blocks.join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const startEvent = (id: string) => `event: start\ndata: ${JSON.stringify({ conversation_id: id })}\n\n`;
const deltaEvent = (content: string) => `data: ${JSON.stringify({ delta: content })}\n\n`;
const toolCallEvent = (name: string, args: Record<string, unknown>, result = "ok") =>
  `event: tool_call\ndata: ${JSON.stringify({ name, arguments: args, result })}\n\n`;
const doneEvent = () =>
  `event: done\ndata: ${JSON.stringify({ sources: [], memory_notes: [], attachments: [] })}\n\n`;

/** Simule le patchThread du provider (workspace-provider.tsx) : retrouve le
 * message PAR SON PROPRE id (fixé une fois, au montage), jamais celui d'un
 * patch reçu. C'est exactement ce qui expose le bug corrigé : un patch
 * contenant `id` écraserait cet id de référence et romprait tout patch
 * suivant. */
function makeProviderLikeHarness() {
  const assistantId = uid();
  let message: ChatMessage = {
    id: assistantId,
    role: "assistant",
    content: "",
    createdAt: Date.now(),
    attachments: [],
    steps: [],
    tools: [],
    status: "streaming",
  };
  const patchCalls: Array<Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)> = [];

  const patch = (p: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) => {
    patchCalls.push(p);
    // Reproduit fidèlement patchThread : le message n'est retrouvé QUE par
    // `assistantId` (jamais par un id porté par le patch lui-même).
    if (message.id !== assistantId) return; // déjà cassé par un patch précédent — n'arrive plus après le fix
    const applied = typeof p === "function" ? p(message) : p;
    message = { ...message, ...applied };
  };

  return { assistantId, patch, getMessage: () => message, patchCalls };
}

describe("startChatRun — régression id écrasé pendant le streaming", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ne renvoie jamais `id` dans un patch objet (l'id du message ne doit être fixé qu'à sa création)", async () => {
    const conversationId = "11111111-1111-1111-1111-111111111111";
    const sse = sseResponse([
      startEvent(conversationId),
      deltaEvent("Bonjour"),
      deltaEvent(", je suis prête."),
      doneEvent(),
    ]);
    vi.mocked(fetch).mockResolvedValue(sse);

    const harness = makeProviderLikeHarness();
    const controller = new AbortController();

    await startChatRun({
      message: "Salut",
      files: [],
      webSearch: false,
      mentions: EMPTY_MENTIONS,
      conversationId: null,
      signal: controller.signal,
      callbacks: {
        patch: harness.patch,
        setSteps: () => {},
        bind: () => {},
        settled: () => {},
      },
    });

    const objectPatches = harness.patchCalls.filter(
      (p): p is Partial<ChatMessage> => typeof p !== "function",
    );
    expect(objectPatches.some((p) => "id" in p)).toBe(false);
  });

  it("le message reste adressable par son id tout au long du flux (delta, tool_call, done)", async () => {
    const sse = sseResponse([
      startEvent("conv-1"),
      deltaEvent("Ok"),
      toolCallEvent("ask_user", { question: "Quel créneau ?", options: [] }),
      doneEvent(),
    ]);
    vi.mocked(fetch).mockResolvedValue(sse);

    const harness = makeProviderLikeHarness();
    const controller = new AbortController();

    await startChatRun({
      message: "Planifie un point",
      files: [],
      webSearch: false,
      mentions: EMPTY_MENTIONS,
      conversationId: null,
      signal: controller.signal,
      callbacks: {
        patch: harness.patch,
        setSteps: () => {},
        bind: () => {},
        settled: () => {},
      },
    });

    // Avant le fix : le tout premier patch contenait `id`, l'écrasait, et
    // tous les patches suivants (dont celui-ci) devenaient des no-ops —
    // le message restait vide avec status "streaming" pour toujours.
    const message = harness.getMessage();
    expect(message.id).toBe(harness.assistantId);
    expect(message.content).toBe("Ok");
    expect(message.status).toBe("done");
    expect(message.tools).toHaveLength(1);
    expect(message.tools?.[0].name).toBe("ask_user");
  });
});
