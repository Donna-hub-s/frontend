// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectCapacityWs } from "./use-project-ws";
import type { CapacityUpdate, ReminderDue } from "./user-channel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 1; // WebSocket.OPEN
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3; // WebSocket.CLOSED
    if (this.onclose) this.onclose();
  }
}

let host: HTMLElement;
let root: Root;

function Probe({
  wsBaseUrl,
  onUpdate,
  onReminder,
}: {
  wsBaseUrl: string | null;
  onUpdate: (update: CapacityUpdate) => void;
  onReminder?: (reminder: ReminderDue) => void;
}) {
  useProjectCapacityWs(wsBaseUrl, onUpdate, undefined, onReminder);
  return createElement("div");
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useProjectCapacityWs", () => {
  it("ne fait rien si wsBaseUrl est null", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await act(async () => {
      root.render(createElement(Probe, { wsBaseUrl: null, onUpdate: () => {} }));
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(MockWebSocket.instances.length).toBe(0);
  });

  it("échange un ticket puis ouvre le WebSocket", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ticket: "test-ticket-123" }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await act(async () => {
      root.render(createElement(Probe, { wsBaseUrl: "ws://localhost:8080", onUpdate: () => {} }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/donna/auth/ws/ticket", expect.objectContaining({ method: "POST" }));
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe("ws://localhost:8080/ws/user?ticket=test-ticket-123");
  });

  it("envoie un ping toutes les 25s une fois la connexion ouverte", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ ticket: "ticket-ping" }),
    }));

    await act(async () => {
      root.render(createElement(Probe, { wsBaseUrl: "ws://localhost:8080", onUpdate: () => {} }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onopen?.();
    });

    expect(ws.sentMessages).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });

    expect(ws.sentMessages).toEqual([JSON.stringify({ type: "ping" })]);
  });

  it("transmet les événements reçus (rappels, capacités) aux callbacks", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ ticket: "ticket-events" }),
    }));

    const onReminder = vi.fn();
    await act(async () => {
      root.render(createElement(Probe, { wsBaseUrl: "ws://localhost:8080", onUpdate: () => {}, onReminder }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.onopen?.();
    });

    const reminderPayload = JSON.stringify({
      channel: "user",
      action: "REMINDER_DUE",
      payload: { reminder_id: "r1", conversation_id: "c1", message_id: "m1", content: "Réunion" },
    });

    act(() => {
      ws.onmessage?.({ data: reminderPayload });
    });

    expect(onReminder).toHaveBeenCalledWith({
      reminderId: "r1",
      conversationId: "c1",
      messageId: "m1",
      content: "Réunion",
    });
  });
});
