"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ConversationOut, PendingActionOut, Step } from "@/lib/workspace-types";

type Activity = { status: "idle" | "running" | "done" | "error"; steps: Step[] };

type WorkspaceValue = {
  conversations: ConversationOut[];
  upsertConversation: (conversation: ConversationOut) => void;
  removeConversation: (id: string) => void;
  refreshConversations: () => Promise<void>;
  pending: PendingActionOut[];
  refreshPending: () => Promise<void>;
  decideAction: (id: string, decision: "confirm" | "cancel") => Promise<boolean>;
  /** Décisions prises pendant la session (l'action disparaît de la liste backend une fois traitée). */
  decisions: Record<string, "confirm" | "cancel">;
  activity: Activity;
  setActivity: (activity: Activity) => void;
  /** Fenêtre de recherche (Ctrl+K / ⌘K). */
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace doit être utilisé dans <WorkspaceProvider>");
  return value;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** État partagé : barre latérale, conversation et panneau d'activité lisent la même source. */
export function WorkspaceProvider({
  initialConversations,
  initialPending,
  children,
}: {
  initialConversations: ConversationOut[];
  initialPending: PendingActionOut[];
  children: ReactNode;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [pending, setPending] = useState(initialPending);
  const [decisions, setDecisions] = useState<Record<string, "confirm" | "cancel">>({});
  const [activity, setActivity] = useState<Activity>({ status: "idle", steps: [] });
  const [searchOpen, setSearchOpen] = useState(false);

  const upsertConversation = useCallback((conversation: ConversationOut) => {
    setConversations((list) => {
      const rest = list.filter((c) => c.id !== conversation.id);
      const existing = list.find((c) => c.id === conversation.id);
      return existing ? list.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c)) : [conversation, ...rest];
    });
  }, []);

  const removeConversation = useCallback((id: string) => {
    setConversations((list) => list.filter((c) => c.id !== id));
  }, []);

  const refreshConversations = useCallback(async () => {
    const list = await getJson<ConversationOut[]>("/api/donna/chat/");
    if (list) setConversations(list);
  }, []);

  const refreshPending = useCallback(async () => {
    const list = await getJson<PendingActionOut[]>("/api/donna/chat/memory/actions");
    if (list) setPending(list);
  }, []);

  const decideAction = useCallback(
    async (id: string, decision: "confirm" | "cancel") => {
      try {
        const response = await fetch(`/api/donna/chat/memory/actions/${encodeURIComponent(id)}/${decision}`, {
          method: "POST",
        });
        if (!response.ok) return false;
        setDecisions((d) => ({ ...d, [id]: decision }));
        await refreshPending();
        return true;
      } catch {
        return false;
      }
    },
    [refreshPending],
  );

  const value = useMemo(
    () => ({
      conversations,
      upsertConversation,
      removeConversation,
      refreshConversations,
      pending,
      refreshPending,
      decideAction,
      decisions,
      activity,
      setActivity,
      searchOpen,
      setSearchOpen,
    }),
    [conversations, upsertConversation, removeConversation, refreshConversations, pending, refreshPending, decideAction, decisions, activity, searchOpen],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
