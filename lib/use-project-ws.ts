"use client";

import { useEffect, useRef } from "react";

/**
 * Connexion WebSocket temps réel (canal "user", voir extensions/xwebsocket) —
 * relaie les mises à jour de capacité de contexte d'un projet dès qu'une
 * ingestion RAG se termine, sans recharger la page.
 *
 * Le jeton d'accès reste httpOnly (jamais lu par ce module) : chaque
 * connexion échange d'abord un ticket à usage unique, courte durée de vie
 * (POST /api/donna/auth/ws/ticket, proxy qui injecte le Bearer côté serveur)
 * contre l'accès au websocket — voir backend/extensions/xwebsocket/main.py.
 */

const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

type CapacityUpdate = { projectId: string; contextChunksUsed: number };

export function useProjectCapacityWs(wsBaseUrl: string | null, onUpdate: (update: CapacityUpdate) => void) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

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
          try {
            const message = JSON.parse(event.data as string) as {
              action?: string;
              payload?: { project_id?: string; project_chunk_total?: number };
            };
            const projectId = message.payload?.project_id;
            const chunkTotal = message.payload?.project_chunk_total;
            if (message.action === "RAG_INGESTION_STATUS" && projectId && typeof chunkTotal === "number") {
              onUpdateRef.current({ projectId, contextChunksUsed: chunkTotal });
            }
          } catch {
            // Message non JSON ou inattendu — ignoré, pas fatal pour la connexion.
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
