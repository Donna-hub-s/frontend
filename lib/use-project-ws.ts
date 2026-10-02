"use client";

import { useEffect, useRef } from "react";
import { parseUserChannelMessage, type CapacityUpdate, type DocumentStatusUpdate, type ReminderDue } from "./user-channel";

export type { DocumentStatusUpdate, ReminderDue } from "./user-channel";

/**
 * Connexion WebSocket temps réel (canal "user", voir extensions/xwebsocket) —
 * relaie les mises à jour de capacité de contexte d'un projet dès qu'une
 * ingestion RAG se termine, et les rappels qui se déclenchent, sans recharger la page.
 *
 * Le jeton d'accès reste httpOnly (jamais lu par ce module) : chaque
 * connexion échange d'abord un ticket à usage unique, courte durée de vie
 * (POST /api/donna/auth/ws/ticket, proxy qui injecte le Bearer côté serveur)
 * contre l'accès au websocket — voir backend/extensions/xwebsocket/main.py.
 */

const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export function useProjectCapacityWs(
  wsBaseUrl: string | null,
  onUpdate: (update: CapacityUpdate) => void,
  onDocumentUpdate?: (update: DocumentStatusUpdate) => void,
  onReminder?: (reminder: ReminderDue) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  const onDocumentUpdateRef = useRef(onDocumentUpdate);
  useEffect(() => {
    onDocumentUpdateRef.current = onDocumentUpdate;
  }, [onDocumentUpdate]);
  const onReminderRef = useRef(onReminder);
  useEffect(() => {
    onReminderRef.current = onReminder;
  }, [onReminder]);

  useEffect(() => {
    if (!wsBaseUrl) return;
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = RECONNECT_INITIAL_MS;

    const scheduleReconnect = () => {
      if (cancelled) return;
      reconnectTimer = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    };

    async function connect() {
      if (cancelled) return;
      try {
        const response = await fetch("/api/donna/auth/ws/ticket", { method: "POST", cache: "no-store" });
        if (!response.ok) throw new Error("ticket");
        const { ticket } = (await response.json()) as { ticket: string };
        if (cancelled) return;

        socket = new WebSocket(`${wsBaseUrl}/ws/user?ticket=${encodeURIComponent(ticket)}`);
        socket.onopen = () => {
          backoff = RECONNECT_INITIAL_MS;
        };
        socket.onmessage = (event) => {
          for (const update of parseUserChannelMessage(event.data as string)) {
            if (update.kind === "capacity") onUpdateRef.current(update.update);
            else if (update.kind === "document") onDocumentUpdateRef.current?.(update.update);
            else onReminderRef.current?.(update.reminder);
          }
        };
        socket.onclose = () => {
          if (!cancelled) scheduleReconnect();
        };
        socket.onerror = () => {
          socket?.close();
        };
      } catch {
        scheduleReconnect();
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [wsBaseUrl]);
}
