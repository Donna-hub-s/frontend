"use client";

// Orchestration d'un envoi de message vers DONNA.
//
// Isolé du composant et du provider (tous deux l'importent) pour que le
// machine à états du flux — étapes, deltas, outils, propositions, erreurs —
// soit écrite une seule fois, quel que soit l'écran qui déclenche l'envoi.

import { clearStaleModel, modelRequestFields } from "./model-choice";
import { readChatStream, type PrepStep } from "./chat-stream";
import type { AttachedFileOut, AttachmentOut, ChatMessage, MentionSelection, RagInfoOut, SourceOut, Step, StepData, ToolCall } from "./workspace-types";

/** Étapes techniques (lecture de la demande, rédaction) : jamais affichées seules —
 * une question simple ne déclenche aucun panneau d'étapes. */
export const TECHNICAL_STEPS = new Set(["read", "answer"]);

export const visibleSteps = (steps: Step[]) => steps.filter((step) => !TECHNICAL_STEPS.has(step.key));

export const uid = () => crypto.randomUUID();

/** Résultat structuré d'une tâche de préparation terminée (null : rien à détailler). */
const prepData = (step: PrepStep): StepData | undefined => {
  switch (step.key) {
    case "rag":
      return step.info ? { kind: "rag", info: step.info } : undefined;
    case "rerank":
      return { kind: "rerank", count: step.count ?? null, failed: step.status === "failed" };
    case "documents":
      return { kind: "documents", names: step.names ?? [] };
    case "project":
      return { kind: "project", name: step.name ?? "", instructions: !!step.instructions, facts: step.facts ?? 0 };
    case "memory":
      return { kind: "memory", facts: step.facts ?? 0 };
    case "conversation_files":
      return { kind: "convfiles", names: step.names ?? [], pending: step.pending ?? 0 };
    default:
      return undefined;
  }
};

/**
 * Applique un événement « step » du backend : la préparation du contexte (recherche dans les
 * documents, reclassement, lecture des @mentions, projet, mémoire) devient des tâches
 * affichées « en cours » puis terminées, avec leur durée réelle. Plusieurs peuvent tourner
 * en même temps (le backend les lance en parallèle) : une tâche en cours n'en termine jamais
 * une autre.
 */
export function applyPrepStep(steps: Step[], event: PrepStep, now = Date.now()): Step[] {
  const data = event.status === "running" ? undefined : prepData(event);
  const index = steps.findLastIndex((s) => s.key === event.key && s.status === "running");
  if (event.status === "running") {
    return index >= 0 ? steps : [...steps, { id: uid(), key: event.key, status: "running", at: now }];
  }
  if (index >= 0) return steps.map((s, i) => (i === index ? { ...s, status: "done" as const, data } : s));
  return [...steps, { id: uid(), key: event.key, status: "done", at: now, data }];
}

/** Outils qui créent une action en attente de confirmation humaine. */
export const PROPOSALS = new Set(["propose_email", "propose_calendar_event", "propose_drive_upload", "propose_workflow", "propose_research"]);

export type ErrorKind = NonNullable<ChatMessage["error"]>;

export const errorFromStatus = (status: number): ErrorKind =>
  status === 401 ? "session" : status === 429 ? "tooMany" : status >= 500 || status === 0 ? "unavailable" : "generic";

/** Raison lisible d'un refus du serveur (corps JSON {detail: "…"}), pour l'afficher telle quelle. */
async function readDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : undefined;
  } catch {
    return undefined;
  }
}

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
  /** Identifiant serveur du message UTILISATEUR de ce tour (absent en régénération :
   * il existait déjà) — voir ChatResponse.user_message_id / l'événement SSE "done". */
  patchUser: (serverId: string | undefined) => void;
};

export type RunOutcome = { conversationId: string | null; proposed: boolean };

export type RunInput = {  message: string;
  files: File[];
  webSearch: boolean;
  mentions: MentionSelection;
  conversationId: string | null;
  projectId?: string;
  /** Agent du projet choisi (« » = aucun, à retirer) ; undefined = conversation hors projet, rien n'est envoyé. */
  agentId?: string;
  /** Remplace un message UTILISATEUR de la branche affichée par `message` (nouvelle
   * version sœur) — voir branches.py. Jamais combiné avec des fichiers. */
  editMessageId?: string;
  /** Régénère la réponse de DONNA visée (nouvelle version sœur) ; `message` est alors
   * ignoré par le serveur (le texte original est rejoué) — voir branches.py. */
  regenerateMessageId?: string;
  /** Mode vocal : la réponse sera lue à voix haute (le serveur ajoute une consigne de style à ce tour seulement). */
  voice?: boolean;
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
  const { message, files, webSearch, mentions, projectId, agentId, editMessageId, regenerateMessageId, voice, signal, callbacks } = input;
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
      const modelFields = modelRequestFields();
      if (modelFields.model) form.set("model", modelFields.model);
      if (modelFields.effort) form.set("effort", modelFields.effort);
      if (agentId !== undefined) form.set("agent_id", agentId);
      if (mentions.projectId) form.set("mentioned_project_id", mentions.projectId);
      if (mentions.documentIds.length) form.set("mentioned_document_ids", JSON.stringify(mentions.documentIds));
      for (const file of files) form.append("files", file);
      const response = await fetch("/api/donna/chat/upload", { method: "POST", body: form, signal });
      if (!response.ok) {
        if (modelFields.model) clearStaleModel(response.status);
        throw Object.assign(new Error("http"), { kind: errorFromStatus(response.status), detail: await readDetail(response) });
      }
      const data = (await response.json()) as {
        conversation_id: string;
        reply: string;
        question: string | null;
        options: string[];
        sources: SourceOut[];
        rag?: RagInfoOut | null;
        file_report?: AttachedFileOut[];
        memory_notes: string[];
        attachments: AttachmentOut[];
        message_id?: string | null;
        user_message_id?: string | null;
      };
      bind(data.conversation_id);
      callbacks.patchUser(data.user_message_id ?? undefined);
      const tools: ToolCall[] = data.question
        ? [{ name: "ask_user", arguments: { question: data.question, options: data.options }, result: "" }]
        : [];
      // Route sans flux : la recherche documentaire n'est connue qu'à la fin (étape rétroactive).
      const ragFirst: Step[] =
        data.rag && data.rag.status !== "skipped"
          ? [{ id: uid(), key: "rag", status: "done", at: Date.now(), data: { kind: "rag", info: data.rag } }]
          : [];
      // Étape « fichiers » : combien ont été lus, lesquels tronqués faute de place dans le contexte.
      const filesData: StepData = { kind: "files", files: data.file_report ?? [] };
      const filesDone = finishSteps().map((s) => (s.key === "files" && data.file_report?.length ? { ...s, data: filesData } : s));
      setSteps([...ragFirst, ...filesDone, { id: uid(), key: "answer", status: "done", at: Date.now() }], "done");
      callbacks.patch({ content: data.reply, sources: data.sources, rag: data.rag ?? undefined, memory: data.memory_notes, attachments: data.attachments, tools, status: "done", serverId: data.message_id ?? undefined });
      callbacks.settled(data.question ? "question" : "response");
    } else {
      const modelFields = modelRequestFields();
      const response = await fetch("/api/donna/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({
          ...modelFields,
          message,
          conversation_id: conversationId,
          project_id: conversationId ? undefined : projectId,
          agent_id: agentId,
          edit_message_id: editMessageId,
          regenerate_message_id: regenerateMessageId,
          web_search: webSearch,
          voice: voice || undefined,
          mentioned_project_id: mentions.projectId,
          mentioned_document_ids: mentions.documentIds,
        }),
        signal,
      });
      if (!response.ok) {
        if (modelFields.model) clearStaleModel(response.status);
        throw Object.assign(new Error("http"), { kind: errorFromStatus(response.status), detail: await readDetail(response) });
      }

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
        } else if (event.type === "step") {
          // Progression RÉELLE de la préparation du contexte (voir applyPrepStep).
          setSteps(applyPrepStep(steps, event.step));
          if (event.step.key === "rag" && event.step.info) callbacks.patch({ rag: event.step.info });
        } else if (event.type === "sources") {
          callbacks.patch({ sources: event.sources });
          // Serveur sans événements « step » : on garde l'ancienne étape rétroactive.
          if (event.sources.length && !steps.some((s) => s.key === "rag")) {
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
          callbacks.patch({ sources: event.sources, memory: event.memory, attachments: event.attachments, status: "done", serverId: event.messageId });
          callbacks.patchUser(event.userMessageId);
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
      const { kind = "unavailable", detail } = error as { kind?: ErrorKind; detail?: string };
      setSteps(finishSteps(), "error");
      callbacks.patch({ status: "error", error: kind, errorDetail: kind === "generic" ? detail : undefined });
    }
  }
  return { conversationId, proposed };
}
