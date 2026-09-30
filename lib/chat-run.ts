"use client";

// Orchestration d'un envoi de message vers DONNA.
//
// Isolé du composant et du provider (tous deux l'importent) pour que le
// machine à états du flux — étapes, deltas, outils, propositions, erreurs —
// soit écrite une seule fois, quel que soit l'écran qui déclenche l'envoi.

import { readChatStream } from "./chat-stream";
import type { AttachmentOut, ChatMessage, MentionSelection, SourceOut, Step, ToolCall } from "./workspace-types";

/** Étapes techniques (lecture de la demande, rédaction) : jamais affichées seules —
 * une question simple ne déclenche aucun panneau d'étapes. */
export const TECHNICAL_STEPS = new Set(["read", "answer"]);

export const visibleSteps = (steps: Step[]) => steps.filter((step) => !TECHNICAL_STEPS.has(step.key));

export const uid = () => crypto.randomUUID();

/** Outils qui créent une action en attente de confirmation humaine. */
export const PROPOSALS = new Set(["propose_email", "propose_calendar_event", "propose_drive_upload"]);

export type ErrorKind = NonNullable<ChatMessage["error"]>;

export const errorFromStatus = (status: number): ErrorKind =>
  status === 401 ? "session" : status === 429 ? "tooMany" : status >= 500 || status === 0 ? "unavailable" : "generic";

export const EMPTY_MENTIONS: MentionSelection = { projectId: null, documentIds: [] };

export type RunCallbacks = {
  /** Messages de la conversation (les deux derniers ajoutés : question + réponse). */
  patch: (patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) => void;
  /** Remplace les étapes de la réponse en cours. */
  setSteps: (steps: Step[], status?: "running" | "done" | "error") => void;
  /** Le backend a créé la conversation : on Adopt son id. */
  bind: (id: string) => void;
  /** Étape terminée (réponse complète, ou question posée). */
  settled: (kind: "response" | "question") => void;
};

export type RunOutcome = { conversationId: string | null; proposed: boolean };

export type RunInput = {  message: string;
  files: File[];
  webSearch: boolean;
  mentions: MentionSelection;
  conversationId: string | null;
  projectId?: string;
  signal: AbortSignal;
  callbacks: RunCallbacks;
};

/**
 * Envoie un message et tient à jour la réponse en cours via `callbacks`.
 * Ne lève jamais : les erreurs sont converties en état sur le message.
 * Renvoie l'identifiant de conversation (créée au premier échange) et si une
 * action a été proposée — le backend y ajoute alors la confirmation à valider.
 */
export async function startChatRun(input: RunInput): Promise<RunOutcome> {
  const { message, files, webSearch, mentions, projectId, signal, callbacks } = input;
  let conversationId = input.conversationId;
  const bind = (id: string) => {
    if (!id || conversationId) return;
    conversationId = id;
    callbacks.bind(id);
  };
  let proposed = false;

  let steps: Step[] = [{ id: uid(), key: files.length ? "files" : "read", status: "running", at: Date.now() }];
  const setSteps = (next: Step[], status: "running" | "done" | "error" = "running") => {
    steps = next;
    callbacks.setSteps(next, status);
  };
  const finishSteps = () => steps.map((s) => (s.status === "running" ? { ...s, status: "done" as const } : s));

  // Le message assistant existe déjà (créé par le provider avant d'appeler
  // startChatRun) : on ne fait ici que poser l'étape initiale, sans repasser
  // `id` dans un patch — l'écraser romprait le suivi par id côté provider et
  // figerait le message (plus aucune mise à jour ne le retrouverait).
  // Première étape « en cours » : le panneau d'activité s'ouvre tout de suite
  // (pièce jointe), ou reste fermé si elle est technique (voir visibleSteps).
  callbacks.setSteps(steps, "running");

  try {
    if (files.length) {
      // Fichiers joints : route non diffusée en continu (extraction, transcription, RAG).
      const form = new FormData();
      if (message) form.set("message", message);
      if (conversationId) form.set("conversation_id", conversationId);
      else if (projectId) form.set("project_id", projectId);
      if (webSearch) form.set("web_search", "true");
      if (mentions.projectId) form.set("mentioned_project_id", mentions.projectId);
      if (mentions.documentIds.length) form.set("mentioned_document_ids", JSON.stringify(mentions.documentIds));
      for (const file of files) form.append("files", file);
      const response = await fetch("/api/donna/chat/upload", { method: "POST", body: form, signal });
      if (!response.ok) throw Object.assign(new Error("http"), { kind: errorFromStatus(response.status) });
      const data = (await response.json()) as {
        conversation_id: string;
        reply: string;
        question: string | null;
        options: string[];
        sources: SourceOut[];
        memory_notes: string[];
        attachments: AttachmentOut[];
      };
      bind(data.conversation_id);
      const tools: ToolCall[] = data.question
        ? [{ name: "ask_user", arguments: { question: data.question, options: data.options }, result: "" }]
        : [];
      setSteps([...finishSteps(), { id: uid(), key: "answer", status: "done", at: Date.now() }], "done");
      callbacks.patch({ content: data.reply, sources: data.sources, memory: data.memory_notes, attachments: data.attachments, tools, status: "done" });
      callbacks.settled(data.question ? "question" : "response");
    } else {
      const response = await fetch("/api/donna/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
          project_id: conversationId ? undefined : projectId,
          web_search: webSearch,
          mentioned_project_id: mentions.projectId,
          mentioned_document_ids: mentions.documentIds,
        }),
        signal,
      });
      if (!response.ok) throw Object.assign(new Error("http"), { kind: errorFromStatus(response.status) });

      let answering = false;
      let finished = false;
      let asked = false;
      for await (const event of readChatStream(response)) {
        if (event.type === "start") bind(event.conversationId);
        else if (event.type === "delta") {
          if (!answering) {
            answering = true;
            setSteps([...finishSteps(), { id: uid(), key: "answer", status: "running", at: Date.now() }]);
          }
          callbacks.patch((m) => ({ content: m.content + event.content }));
        } else if (event.type === "sources") {
          // Recherche documentaire effectuée avant l'ouverture du flux : étape rétroactive.
          callbacks.patch({ sources: event.sources });
          if (event.sources.length) {
            setSteps([{ id: uid(), key: "rag", status: "done", at: Date.now() }, ...finishSteps()]);
          }
        } else if (event.type === "tool_start") {
          // Étape affichée « en cours » pendant l'exécution de l'outil.
          answering = false;
          setSteps([...finishSteps(), { id: uid(), key: event.name, status: "running", at: Date.now() }]);
        } else if (event.type === "tool_call") {
          answering = false;
          if (PROPOSALS.has(event.call.name)) proposed = true;
          if (event.call.name === "ask_user") asked = true;
          const index = steps.findLastIndex((s) => s.key === event.call.name && s.status === "running");
          setSteps(
            index >= 0
              ? steps.map((s, i) => (i === index ? { ...s, status: "done" as const } : s))
              : [...finishSteps(), { id: uid(), key: event.call.name, status: "done", at: Date.now() }],
          );
          callbacks.patch((m) => ({ tools: [...(m.tools ?? []), event.call] }));
        } else if (event.type === "error") {
          throw Object.assign(new Error("stream"), { kind: "generic" as ErrorKind });
        } else if (event.type === "done") {
          finished = true;
          setSteps(finishSteps(), "done");
          callbacks.patch({ sources: event.sources, memory: event.memory, attachments: event.attachments, status: "done" });
        }
      }
      if (!finished) throw Object.assign(new Error("interrupted"), { kind: "generic" as ErrorKind });
      callbacks.settled(asked ? "question" : "response");
    }
  } catch (error) {
    if (signal.aborted) {
      setSteps(finishSteps(), "done");
      callbacks.patch({ status: "stopped" });
    } else {
      const kind = (error as { kind?: ErrorKind }).kind ?? "unavailable";
      setSteps(finishSteps(), "error");
      callbacks.patch({ status: "error", error: kind });
    }
  }
  return { conversationId, proposed };
}
