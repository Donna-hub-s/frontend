"use client";

import { useCallback, useEffect, useState } from "react";
import { compactOutcome, type CompactOutcome } from "./context";
import type { ContextStatusOut } from "./workspace-types";

type Loaded = { id: string; status: ContextStatusOut };

async function getJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(path, { cache: "no-store", ...init });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * État du contexte d'une conversation (jauge) et compaction à la demande (/compact).
 * Relu à chaque fin de réponse : la compaction automatique tourne en tâche de fond après un tour.
 */
export function useConversationContext(conversationId: string | null, busy: boolean) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [compacting, setCompacting] = useState(false);
  const status = conversationId && loaded?.id === conversationId ? loaded.status : null;

  useEffect(() => {
    if (!conversationId || busy) return;
    let cancelled = false;
    void getJson<ContextStatusOut>(`/api/donna/chat/${encodeURIComponent(conversationId)}/context`).then((data) => {
      if (!cancelled && data) setLoaded({ id: conversationId, status: data });
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, busy]);

  const refresh = useCallback(async () => {
    if (!conversationId) return;
    const data = await getJson<ContextStatusOut>(`/api/donna/chat/${encodeURIComponent(conversationId)}/context`);
    if (data) setLoaded({ id: conversationId, status: data });
  }, [conversationId]);

  /** Compacte maintenant. null = échec (réseau, serveur) ; sinon ce qui s'est passé. */
  const compact = useCallback(async (): Promise<CompactOutcome | null> => {
    if (!conversationId || compacting) return null;
    setCompacting(true);
    const after = await getJson<ContextStatusOut>(`/api/donna/chat/${encodeURIComponent(conversationId)}/compact`, { method: "POST" });
    setCompacting(false);
    if (!after) return null;
    const outcome = compactOutcome(status, after);
    setLoaded({ id: conversationId, status: after });
    return outcome;
  }, [conversationId, compacting, status]);

  return { status, compacting, compact, refresh };
}
