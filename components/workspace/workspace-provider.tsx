"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useProjectCapacityWs } from "@/lib/use-project-ws";
import type {
  ConversationOut,
  MentionSelection,
  PendingActionOut,
  ProjectOut,
  Step,
} from "@/lib/workspace-types";

/** Fichier ouvert dans la visionneuse (file-viewer.tsx). `url` : chemin /api/donna/… */
export type FilePreview = { url: string; name: string };

type Activity = { status: "idle" | "running" | "done" | "error"; steps: Step[] };

/** Message tapé sur la page projet (project-detail.tsx), consommé une seule fois
 * par la nouvelle conversation (conversation.tsx) dès son montage. En mémoire
 * (pas sessionStorage) : /app/* partage le même WorkspaceProvider tout au long
 * de la navigation client, ce qui permet de faire transiter de vrais File —
 * impossible à sérialiser. */
type ProjectDraft = { message: string; files: File[]; webSearch: boolean; mentions: MentionSelection };

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
  preview: FilePreview | null;
  setPreview: (file: FilePreview | null) => void;
  /** Fenêtre des paramètres (settings-dialog.tsx). */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /** Fenêtre de recherche (Ctrl+K / ⌘K). */
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  projects: ProjectOut[];
  upsertProject: (project: ProjectOut) => void;
  removeProject: (id: string) => void;
  refreshProjects: () => Promise<void>;
  projectDraft: ProjectDraft | null;
  setProjectDraft: (draft: ProjectDraft | null) => void;
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
  initialProjects,
  wsBaseUrl = null,
  children,
}: {
  initialConversations: ConversationOut[];
  initialPending: PendingActionOut[];
  initialProjects: ProjectOut[];
  /** Base ws(s)://... du backend, dérivée côté serveur (voir app/[lang]/app/layout.tsx) — null si non configurée (notifications temps réel simplement désactivées). */
  wsBaseUrl?: string | null;
  children: ReactNode;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [pending, setPending] = useState(initialPending);
  const [decisions, setDecisions] = useState<Record<string, "confirm" | "cancel">>({});
  const [activity, setActivity] = useState<Activity>({ status: "idle", steps: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projects, setProjects] = useState(initialProjects);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null);

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

  const upsertProject = useCallback((project: ProjectOut) => {
    setProjects((list) => {
      const rest = list.filter((p) => p.id !== project.id);
      const existing = list.find((p) => p.id === project.id);
      return existing ? list.map((p) => (p.id === project.id ? { ...p, ...project } : p)) : [project, ...rest];
    });
  }, []);

  const removeProject = useCallback((id: string) => {
    setProjects((list) => list.filter((p) => p.id !== id));
  }, []);

  const refreshProjects = useCallback(async () => {
    const list = await getJson<ProjectOut[]>("/api/donna/chat/projects");
    if (list) setProjects(list);
  }, []);

  const patchProjectCapacity = useCallback((projectId: string, contextChunksUsed: number) => {
    setProjects((list) =>
      list.map((p) => (p.id === projectId ? { ...p, context_chunks_used: contextChunksUsed } : p)),
    );
  }, []);

  useProjectCapacityWs(
    wsBaseUrl,
    useCallback(
      ({ projectId, contextChunksUsed }) => patchProjectCapacity(projectId, contextChunksUsed),
      [patchProjectCapacity],
    ),
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
      preview,
      setPreview,
      settingsOpen,
      setSettingsOpen,
      projects,
      upsertProject,
      removeProject,
      refreshProjects,
      projectDraft,
      setProjectDraft,
    }),
    [
      conversations,
      upsertConversation,
      removeConversation,
      refreshConversations,
      pending,
      refreshPending,
      decideAction,
      decisions,
      activity,
      searchOpen,
      preview,
      settingsOpen,
      projects,
      upsertProject,
      removeProject,
      refreshProjects,
      projectDraft,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
