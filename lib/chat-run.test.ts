import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_MENTIONS, applyPrepStep, startChatRun, uid } from "./chat-run";
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

describe("startChatRun — tâches de préparation du contexte (événements step)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stepEvent = (step: Record<string, unknown>) => `event: step\ndata: ${JSON.stringify(step)}\n\n`;
  const ragInfo = (info: Record<string, unknown>) => ({
    status: "completed",
    scope: "project",
    sources_count: 0,
    documents_count: 0,
    indexed_documents: 0,
    reranked: false,
    error: null,
    ...info,
  });

  /** Rejoue un flux et renvoie la LISTE DES ÉTATS successifs des étapes (pas seulement le dernier). */
  async function run(blocks: string[]) {
    vi.mocked(fetch).mockResolvedValue(sseResponse([startEvent("conv-1"), ...blocks, deltaEvent("Réponse"), doneEvent()]));
    const harness = makeProviderLikeHarness();
    const history: Array<Array<{ key: string; status: string; data?: { kind: string } }>> = [];
    await startChatRun({
      message: "Quel est le code ?",
      files: [],
      webSearch: false,
      mentions: EMPTY_MENTIONS,
      conversationId: null,
      signal: new AbortController().signal,
      callbacks: {
        patch: harness.patch,
        setSteps: (steps) => {
          history.push(steps.map((s) => ({ key: s.key, status: s.status, data: s.data })));
        },
        bind: () => {},
        settled: () => {},
      },
    });
    return { message: harness.getMessage(), history };
  }

  it("montre la recherche documentaire « en cours » AVANT son résultat", async () => {
    const { history } = await run([
      stepEvent({ key: "rag", status: "running", scope: "project" }),
      stepEvent({ key: "rag", status: "done", info: ragInfo({ sources_count: 3, documents_count: 2 }) }),
    ]);
    const states = history.map((steps) => steps.find((s) => s.key === "rag")?.status);
    expect(states).toContain("running");
    expect(states.indexOf("running")).toBeLessThan(states.lastIndexOf("done"));
    const finalRag = history.at(-1)!.find((s) => s.key === "rag")!;
    expect(finalRag).toMatchObject({ status: "done", data: { kind: "rag" } });
  });

  it("garde plusieurs tâches parallèles : terminer l'une ne termine pas l'autre", async () => {
    const { history } = await run([
      stepEvent({ key: "rag", status: "running", scope: "project" }),
      stepEvent({ key: "documents", status: "running" }),
      stepEvent({ key: "documents", status: "done", names: ["contrat.pdf"] }),
    ]);
    const afterDocuments = history.find((steps) => steps.some((s) => s.key === "documents" && s.status === "done"))!;
    expect(afterDocuments.find((s) => s.key === "rag")?.status).toBe("running");
  });

  it("reporte le reclassement, le projet et la mémoire comme tâches distinctes", async () => {
    const { history } = await run([
      stepEvent({ key: "rerank", status: "running", count: 8 }),
      stepEvent({ key: "rerank", status: "done", count: 3 }),
      stepEvent({ key: "project", status: "done", name: "Sites", instructions: true, facts: 2 }),
      stepEvent({ key: "memory", status: "done", facts: 4 }),
    ]);
    const keys = history.at(-1)!.map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(["rerank", "project", "memory"]));
    expect(history.at(-1)!.find((s) => s.key === "rerank")?.data).toMatchObject({ kind: "rerank", count: 3 });
  });

  it("garde le résultat du RAG sur le message (échec compris)", async () => {
    const { message } = await run([
      stepEvent({ key: "rag", status: "running", scope: "project" }),
      stepEvent({ key: "rag", status: "done", info: ragInfo({ status: "failed", error: "index_mismatch" }) }),
    ]);
    expect(message.rag).toMatchObject({ status: "failed", error: "index_mismatch" });
  });
});

describe("applyPrepStep — fichiers de la conversation", () => {
  it("transforme l'étape conversation_files en tâche terminée avec les noms et le nombre en attente", () => {
    const steps = applyPrepStep([], { key: "conversation_files", status: "done", names: ["rapport.pdf", "notes.docx"], pending: 1 }, 5);
    expect(steps[0]).toMatchObject({
      key: "conversation_files",
      status: "done",
      data: { kind: "convfiles", names: ["rapport.pdf", "notes.docx"], pending: 1 },
    });
  });
});

describe("applyPrepStep", () => {
  it("ne duplique pas une tâche déjà en cours et crée une étape terminée si aucune n'était annoncée", () => {
    const running = applyPrepStep([], { key: "rag", status: "running" }, 1);
    expect(applyPrepStep(running, { key: "rag", status: "running" }, 2)).toHaveLength(1);
    const direct = applyPrepStep([], { key: "memory", status: "done", facts: 2 }, 3);
    expect(direct[0]).toMatchObject({ key: "memory", status: "done", data: { kind: "memory", facts: 2 } });
  });
});
