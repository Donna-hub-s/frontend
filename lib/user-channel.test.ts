import { describe, expect, it } from "vitest";
import { parseUserChannelMessage } from "./user-channel";

const frame = (action: string, payload: unknown) => JSON.stringify({ channel: "user", action, payload, timestamp: "2026-10-02T14:31:02Z" });

describe("parseUserChannelMessage", () => {
  it("décode un rappel qui se déclenche", () => {
    const events = parseUserChannelMessage(
      frame("REMINDER_DUE", { reminder_id: "r1", conversation_id: "c1", message_id: "m1", content: "appeler le client" }),
    );
    expect(events).toEqual([
      { kind: "reminder", reminder: { reminderId: "r1", conversationId: "c1", messageId: "m1", content: "appeler le client" } },
    ]);
  });

  it("accepte un rappel sans conversation (supprimée entre-temps)", () => {
    const [event] = parseUserChannelMessage(frame("REMINDER_DUE", { reminder_id: "r1", conversation_id: null, message_id: null, content: "x" }));
    expect(event).toEqual({ kind: "reminder", reminder: { reminderId: "r1", conversationId: null, messageId: null, content: "x" } });
  });

  it("ignore un rappel sans identifiant ou sans texte", () => {
    expect(parseUserChannelMessage(frame("REMINDER_DUE", { content: "x" }))).toEqual([]);
    expect(parseUserChannelMessage(frame("REMINDER_DUE", { reminder_id: "r1", content: "" }))).toEqual([]);
  });

  it("décode la notification d'une automatisation (briefing du matin)", () => {
    const events = parseUserChannelMessage(
      frame("NOTIFICATION", { source: "workflow", workflow_id: "w1", title: "Briefing du matin", body: "Rien d'urgent.", conversation_id: "c1", message_id: "m1" }),
    );
    expect(events).toEqual([
      { kind: "notification", notification: { messageId: "m1", conversationId: "c1", title: "Briefing du matin", body: "Rien d'urgent." } },
    ]);
  });

  it("ignore une notification sans titre ou sans texte", () => {
    expect(parseUserChannelMessage(frame("NOTIFICATION", { body: "x" }))).toEqual([]);
    expect(parseUserChannelMessage(frame("NOTIFICATION", { title: "T", body: "" }))).toEqual([]);
  });

  it("garde le comportement des statuts d'ingestion RAG : capacité du projet puis document", () => {
    const events = parseUserChannelMessage(
      frame("RAG_INGESTION_STATUS", {
        project_id: "p1",
        project_chunk_total: 12,
        current: { document_id: "d1", status: "done", chunk_count: 4, error: null },
      }),
    );
    expect(events).toEqual([
      { kind: "capacity", update: { projectId: "p1", contextChunksUsed: 12 } },
      { kind: "document", update: { documentId: "d1", status: "done", chunkCount: 4, error: null } },
    ]);
  });

  it("ne produit que ce que le message contient (document seul, erreur conservée)", () => {
    const events = parseUserChannelMessage(
      frame("RAG_INGESTION_STATUS", { current: { document_id: "d2", status: "failed", error: "vecteur invalide" } }),
    );
    expect(events).toEqual([{ kind: "document", update: { documentId: "d2", status: "failed", chunkCount: 0, error: "vecteur invalide" } }]);
  });

  it("ignore les actions inconnues et les messages malformés", () => {
    expect(parseUserChannelMessage(frame("CHAT_STAGE", { stage: "x" }))).toEqual([]);
    expect(parseUserChannelMessage("pas du json")).toEqual([]);
    expect(parseUserChannelMessage(JSON.stringify({ action: "REMINDER_DUE" }))).toEqual([]);
    expect(parseUserChannelMessage("null")).toEqual([]);
  });
});
