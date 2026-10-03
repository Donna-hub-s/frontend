"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { startChatRun, uid, visibleSteps, type RunInput } from "@/lib/chat-run";
import { useProjectCapacityWs, type AppNotification, type DocumentStatusUpdate, type ReminderDue } from "@/lib/use-project-ws";
import type { SkillSettings } from "@/lib/skills";
import { installSessionGuard } from "@/lib/session-guard";
import type { Locale } from "@/i18n/config";
import type {
  ChatMessage,
  ConversationOut,
  MentionSelection,
  PendingActionOut,
  ProjectOut,
  SkillOut,
  Step,
} from "@/lib/workspace-types";

/** Notification in-app : une réponse est arrivée, DONNA pose une question, un rappel s'est déclenché ou une automatisation a écrit. */
export type Notice = "response" | "question" | "reminder" | "notification";

/** Rappel ou notification d'automatisation, affiché jusqu'à ce que l'utilisateur le ferme (voir reminder-toasts.tsx). */
export type ReminderAlert = { id: string; content: string; conversationId: string | null; title?: string | null };

/** Nombre maximum de fils conservés en mémoire (historique complet de chacun). */
const THREAD_LIMIT = 30;

/** Fil de discussion en cours. `key` est l'id de conversation, ou un id local
 * pour une conversation pas encore créée (le backend ne l'id qu'au premier
 * échange). Vivre ici permet au flux de continuer quand l'utilisateur change de
 * conversation : le composant ne fait plus que lire le fil. */
export type Thread = {
  key: string;
  conversationId: string | null;
  messages: ChatMessage[];
  busy: boolean;
  /** Étapes du fil, pour le panneau d'activité quand il est à l'écran. */
  steps: Step[];
};

export type SendInput = {
  key: string;
  message: string;
  files: File[];
  webSearch: boolean;
  mentions: MentionSelection;
  conversationId: string | null;
  projectId?: string;
  /** Langue courante : l'URL est mise à jour dès que le backend crée la conversation. */
  lang: Locale;
  /** Titre provisoire affiché avant le titre généré par le backend. */
  fallbackTitle: string;
  /** Rappelé une fois le flux terminé, pour le titre définitif. */
  onSettled?: (conversationId: string) => void;
};

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
  /** Fils persistants : un par conversation, survivant à la navigation. */
  threads: Record<string, Thread>;
  registerThread: (key: string, conversationId: string | null, initialMessages: ChatMessage[]) => void;
  /** Oublie un fil de conversation provisoire (page « nouvelle conversation »)
   * qui n'a jamais produit d'échange. */
  releaseThread: (key: string) => void;
  /** Clé de fil réellement porteuse du flux pour un id de conversation donné. */
  resolveThreadKey: (conversationId: string) => string;
  /** Conversation affichée à l'écran (pour l'activité et les notifications). */
  activeKey: string | null;
  setActiveKey: (key: string | null) => void;
  send: (input: SendInput) => Promise<void>;
  /** Retire les messages aux index donnés (relance d'une réponse). */
  dropMessages: (key: string, indexes: number[]) => void;
  /** Modifie un message d'un fil (par son id local) : sert, par exemple, à mémoriser mon pouce. */
  patchMessage: (key: string, messageId: string, patch: Partial<ChatMessage>) => void;
  stop: (key: string) => void;
  /** Derniers messages reçus par conversation non affichée (pastille + badge). */
  notices: Record<string, Notice>;
  markRead: (key: string) => void;
  /** Rappels qui viennent de se déclencher (poussés en direct par le websocket). */
  reminders: ReminderAlert[];
  dismissReminder: (id: string) => void;
  /** Catalogue des skills (null tant qu'il n'est pas chargé) et réglages EXPLICITES de l'utilisateur —
   * partagés par le raccourci du chat et l'onglet Compétences des paramètres. */
  skills: SkillOut[] | null;
  skillSettings: SkillSettings;
  refreshSkills: () => Promise<void>;
  /** Active/coupe une skill tout de suite (appliqué dès le prochain message). false = non enregistré. */
  setSkillEnabled: (id: string, enabled: boolean) => Promise<boolean>;
  /** Dernier statut connu par document RAG (clé = document id), mis à jour en
   * direct par le websocket dès qu'une ingestion change d'état — voir
   * project-detail.tsx::FilesCard, qui patche sa liste locale sur cette base. */
  documentStatuses: Record<string, DocumentStatusUpdate>;
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
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, Notice>>({});
  // Les AbortController vivent dans une ref : un changement de conversation ne
  // doit surtout pas annuler le flux, seule l'action « Arrêter » le fait.
  const runs = useRef(new Map<string, AbortController>());
  const activeKeyRef = useRef<string | null>(null);
  const conversationsRef = useRef(initialConversations);
  // Perte de session : le proxy a déjà tenté de renouveler le jeton ; s'il
  // échoue, on renvoie vers /login depuis n'importe quel appel (voir
  // lib/session-guard.ts). Le provider est monté sur tout /app, donc un seul
  // point d'installation suffit.
  useEffect(installSessionGuard, []);
  // Id réel de conversation → clé de fil en mémoire. Une conversation neuve est
  // affichée sous une clé locale ; dès que le backend renvoie son id, le
  // routeur remonte <Conversation key={id}>. Sans cet alias, la vue repartirait
  // d'un fil vide pendant que le flux continue d'alimenter l'ancien. Les
  // notifications suivent la même clé, donc la barre latérale les résout aussi.
  const [threadAlias, setThreadAlias] = useState<Record<string, string>>({});

  const resolveThreadKey = useCallback((conversationId: string) => threadAlias[conversationId] ?? conversationId, [threadAlias]);

  const registerThread = useCallback((key: string, conversationId: string | null, initialMessages: ChatMessage[]) => {
    setThreads((existing) => {
      if (existing[key]) {
        // La conversation a pu être créée entre-temps : on ne fige pas un id nul.
        return existing[key].conversationId || !conversationId
          ? existing
          : { ...existing, [key]: { ...existing[key], conversationId } };
      }
      // Les fils gardent tout l'historique en mémoire : on borne, en évitant
      // un fil affiché ou en cours de rédaction (ceux-ci sont en fin d'objet).
      const keys = Object.keys(existing);
      let next = { ...existing, [key]: { key, conversationId, messages: initialMessages, busy: false, steps: [] } };
      for (let i = 0; keys.length - i >= THREAD_LIMIT; i += 1) {
        const oldest = next[keys[i]];
        if (oldest.busy || keys[i] === activeKeyRef.current) continue;
        const rest = { ...next };
        delete rest[keys[i]];
        next = rest;
      }
      return next;
    });
  }, []);

  const patchThread = useCallback((key: string, patch: (thread: Thread) => Thread) => {
    setThreads((existing) => (existing[key] ? { ...existing, [key]: patch(existing[key]) } : existing));
  }, []);

  const releaseThread = useCallback((key: string) => {
    // Un flux encore en cours garde son fil : le composant l'a quitté, pas le run.
    if (runs.current.has(key)) return;
    setThreads((existing) => {
      const thread = existing[key];
      // On n'oublie que les fils restés vides : tout fil ayant déjà reçu un
      // message est reconstructible côté serveur et ne doit pas être perdu.
      if (!thread || thread.messages.length || thread.busy) return existing;
      const rest = { ...existing };
      delete rest[key];
      return rest;
    });
  }, []);

  const markRead = useCallback((key: string) => {
    setNotices((existing) => {
      if (!existing[key]) return existing;
      const rest = { ...existing };
      delete rest[key];
      return rest;
    });
  }, []);

  const notify = useCallback((key: string, notice: Notice) => {
    // Un fil non affiché devient « non lu » ; celui affiché est déjà lu.
    if (activeKeyRef.current === key) return;
    setNotices((existing) => (existing[key] === notice ? existing : { ...existing, [key]: notice }));
  }, []);

  const stop = useCallback((key: string) => {
    runs.current.get(key)?.abort();
  }, []);

  const dropMessages = useCallback(
    (key: string, indexes: number[]) => {
      const drop = new Set(indexes);
      patchThread(key, (thread) => ({ ...thread, messages: thread.messages.filter((_, i) => !drop.has(i)) }));
    },
    [patchThread],
  );

  const patchMessage = useCallback(
    (key: string, messageId: string, patch: Partial<ChatMessage>) => {
      patchThread(key, (thread) => ({ ...thread, messages: thread.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) }));
    },
    [patchThread],
  );

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

  const [documentStatuses, setDocumentStatuses] = useState<Record<string, DocumentStatusUpdate>>({});

  const [skills, setSkills] = useState<SkillOut[] | null>(null);
  const [skillSettings, setSkillSettings] = useState<SkillSettings>({});
  const refreshSkills = useCallback(async () => {
    const [catalog, profile] = await Promise.all([
      getJson<SkillOut[]>("/api/donna/chat/skills"),
      getJson<{ skills?: SkillSettings }>("/api/donna/profile/me"),
    ]);
    if (catalog) setSkills(catalog);
    if (profile) setSkillSettings(profile.skills ?? {});
  }, []);
  // Chargement initial (même lecture que refreshSkills, gardée contre un démontage en cours de route).
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getJson<SkillOut[]>("/api/donna/chat/skills"),
      getJson<{ skills?: SkillSettings }>("/api/donna/profile/me"),
    ]).then(([catalog, profile]) => {
      if (cancelled) return;
      if (catalog) setSkills(catalog);
      if (profile) setSkillSettings(profile.skills ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSkillEnabled = useCallback(async (id: string, enabled: boolean) => {
    let previous: boolean | undefined;
    // Optimiste : l'interrupteur bouge tout de suite ; on revient en arrière si le serveur refuse.
    setSkillSettings((settings) => {
      previous = settings[id];
      return { ...settings, [id]: enabled };
    });
    const response = await fetch("/api/donna/profile/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skills: { [id]: enabled } }),
    }).catch(() => null);
    if (response?.ok) return true;
    setSkillSettings((settings) => {
      const rest = { ...settings };
      if (previous === undefined) delete rest[id];
      else rest[id] = previous;
      return rest;
    });
    return false;
  }, []);

  const [reminders, setReminders] = useState<ReminderAlert[]>([]);
  const dismissReminder = useCallback((id: string) => setReminders((list) => list.filter((r) => r.id !== id)), []);

  // Un rappel ou une notification d'automatisation vient d'arriver : le serveur a déjà posé le message dans
  // la conversation. On l'ajoute aux fils chargés en mémoire (sinon il n'apparaît qu'au rechargement), on
  // marque la conversation non lue, on affiche la carte et, onglet masqué, une notification du navigateur.
  const deliver = useCallback(
    (item: { id: string; title: string | null; content: string; conversationId: string | null; messageId: string; text: string; notice: Notice }) => {
      setReminders((list) =>
        list.some((r) => r.id === item.id)
          ? list
          : [...list, { id: item.id, title: item.title, content: item.content, conversationId: item.conversationId }].slice(-3),
      );
      if (item.conversationId) {
        const conversationId = item.conversationId;
        // Conversation créée par le serveur (première notification d'un workflow) : absente de la liste
        // tant qu'on ne la recharge pas, donc ni entrée ni pastille dans la barre latérale.
        if (!conversationsRef.current.some((c) => c.id === conversationId)) void refreshConversations();
        setThreads((existing) => {
          let changed = false;
          const next = { ...existing };
          for (const [key, thread] of Object.entries(existing)) {
            if (thread.conversationId !== conversationId || thread.messages.some((m) => m.id === item.messageId)) continue;
            changed = true;
            // Même texte que celui déposé par le serveur (tasks.py::_insert_reminder_message, workflow_service.py::_deliver_app).
            next[key] = {
              ...thread,
              messages: [
                ...thread.messages,
                { id: item.messageId, role: "assistant", content: item.text, createdAt: Date.now(), attachments: [], status: "done" },
              ],
            };
          }
          return changed ? next : existing;
        });
        const key = threadAlias[conversationId] ?? conversationId;
        if (activeKeyRef.current !== key) {
          // Une question en attente reste prioritaire sur un simple rappel ou une notification.
          setNotices((existing) => (existing[key] === "question" ? existing : { ...existing, [key]: item.notice }));
        }
      }
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
          new Notification(item.title ?? "DONNA", { body: item.content.slice(0, 300), tag: item.id });
        }
      } catch {
        // Notification système indisponible : la carte dans l'application suffit.
      }
    },
    [refreshConversations, threadAlias],
  );

  const handleReminder = useCallback(
    (due: ReminderDue) =>
      deliver({
        id: due.reminderId,
        title: null,
        content: due.content,
        conversationId: due.conversationId,
        messageId: `reminder-${due.messageId ?? due.reminderId}`,
        text: `Petit rappel : ${due.content}.`,
        notice: "reminder",
      }),
    [deliver],
  );

  const handleNotification = useCallback(
    (notification: AppNotification) => {
      const id = notification.messageId ?? `${notification.title}-${notification.body.length}`;
      deliver({
        id: `notification-${id}`,
        title: notification.title,
        content: notification.body,
        conversationId: notification.conversationId,
        messageId: `notification-${id}`,
        text: `**${notification.title}**\n\n${notification.body}`,
        notice: "notification",
      });
    },
    [deliver],
  );

  useProjectCapacityWs(
    wsBaseUrl,
    useCallback(
      ({ projectId, contextChunksUsed }) => patchProjectCapacity(projectId, contextChunksUsed),
      [patchProjectCapacity],
    ),
    useCallback(
      (update: DocumentStatusUpdate) => setDocumentStatuses((map) => ({ ...map, [update.documentId]: update })),
      [],
    ),
    handleReminder,
    handleNotification,
  );

  // Refs synchronisées après rendu : lues par les callbacks de flux, hors cycle de rendu.
  useEffect(() => {
    activeKeyRef.current = activeKey;
  }, [activeKey]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const send = useCallback(
    async (input: SendInput) => {
      const { key, message, files, webSearch, mentions, projectId, fallbackTitle } = input;
      if (runs.current.has(key)) return;
      const trimmed = message.trim();
      if (!trimmed && !files.length) return;

      const controller = new AbortController();
      runs.current.set(key, controller);
      const wasNew = !input.conversationId;
      const assistantId = uid();

      patchThread(key, (thread) => ({
        ...thread,
        busy: true,
        messages: [
          ...thread.messages,
          { id: uid(), role: "user", content: trimmed, createdAt: Date.now(), attachments: [], localFiles: files.map((f) => f.name) },
          { id: assistantId, role: "assistant", content: "", createdAt: Date.now(), attachments: [], steps: [], tools: [], status: "streaming" },
        ],
      }));

      const run: RunInput = {
        message: trimmed,
        files,
        webSearch,
        mentions,
        projectId,
        conversationId: input.conversationId,
        signal: controller.signal,
        callbacks: {
          patch: (p) =>
            patchThread(key, (thread) => ({
              ...thread,
              messages: thread.messages.map((m) => (m.id === assistantId ? { ...m, ...(typeof p === "function" ? p(m) : p) } : m)),
            })),
          setSteps: (next, status = "running") => {
            patchThread(key, (thread) => ({
              ...thread,
              steps: next,
              messages: thread.messages.map((m) => (m.id === assistantId ? { ...m, steps: next } : m)),
            }));
            // Le panneau d'activité n'affiche que le fil à l'écran : un flux en
            // arrière-plan ne vole pas l'étape courante à l'utilisateur.
            if (activeKeyRef.current === key) {
              const shown = visibleSteps(next);
              setActivity(shown.length ? { status, steps: shown } : { status: "idle", steps: [] });
            }
          },
          bind: (id) => {
            // La vue suit encore la clé locale ; on y rattache l'id réel pour
            // qu'elle retrouve ce fil après la remontée de la route.
            setThreadAlias((existing) => (existing[id] === key ? existing : { ...existing, [id]: key }));
            patchThread(key, (thread) => ({ ...thread, conversationId: id }));
            // `project_id` est reporté ici : sans lui, l'insertion optimiste
            // ferait apparaître la conversation sans projet dans la barre
            // latérale, alors qu'elle vient d'un projet.
            upsertConversation({
              id,
              title: fallbackTitle.slice(0, 60),
              created_at: new Date().toISOString(),
              project_id: projectId ?? null,
            });
            // L'URL passe à la conversation créée. Attention : Next.js réagit à
            // replaceState et remonte <Conversation key={id}>, donc la vue
            // change de clé de fil en cours de flux. C'est l'alias posé plus
            // haut qui la rattache au bon fil ; le reload, lui, relit l'historique
            // persisté et retrouverait le texte sans streaming.
            if (wasNew) window.history.replaceState(null, "", `/${input.lang}/app/c/${id}`);
          },
          settled: (kind) => notify(key, kind),
        },
      };

      try {
        const outcome = await startChatRun(run);
        if (outcome.proposed) void refreshPending();
        // Le titre définitif est généré en arrière-plan par le backend quelques secondes plus tard.
        if (wasNew && outcome.conversationId) {
          input.onSettled?.(outcome.conversationId);
          window.setTimeout(() => void refreshConversations(), 6000);
        }
      } finally {
        runs.current.delete(key);
        patchThread(key, (thread) => ({ ...thread, busy: false }));
      }
    },
    [notify, patchThread, refreshConversations, refreshPending, upsertConversation],
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
      threads,
      registerThread,
      releaseThread,
      resolveThreadKey,
      activeKey,
      setActiveKey,
      send,
      dropMessages,
      patchMessage,
      stop,
      notices,
      markRead,
      reminders,
      dismissReminder,
      skills,
      skillSettings,
      refreshSkills,
      setSkillEnabled,
      documentStatuses,
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
      threads,
      registerThread,
      releaseThread,
      resolveThreadKey,
      activeKey,
      send,
      dropMessages,
      patchMessage,
      stop,
      notices,
      markRead,
      reminders,
      dismissReminder,
      skills,
      skillSettings,
      refreshSkills,
      setSkillEnabled,
      documentStatuses,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
