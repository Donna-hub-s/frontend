"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { DonnaMark } from "@/components/brand/donna-mark";
import { DonnaOrb, type OrbState } from "@/components/brand/donna-orb";
import { FileLink } from "./file-viewer";
import { actionIdFrom, readChatStream } from "@/lib/chat-stream";
import {
  EMPTY_MENTIONS,
  fileHref,
  type AttachmentOut,
  type ChatMessage,
  type Mention,
  type MentionKind,
  type MentionSelection,
  type PersonalDocumentOut,
  type SourceOut,
  type Step,
  type ToolCall,
} from "@/lib/workspace-types";
import { CheckIcon, ChevronIcon, CloseIcon, FileIcon, FolderIcon, GlobeIcon, MicIcon, PaperclipIcon, SendIcon, StopIcon } from "./icons";
import { Markdown } from "./markdown";
import { StepDot, stepLabel, visibleSteps } from "./side-panel";
import { useWorkspace } from "./workspace-provider";

type WorkspaceDict = Dictionary["workspace"];
type ErrorKind = NonNullable<ChatMessage["error"]>;

const uid = () => crypto.randomUUID();
const PROPOSALS = new Set(["propose_email", "propose_calendar_event"]);

const MAX_FILES = 5;

const errorFromStatus = (status: number): ErrorKind =>
  status === 401 ? "session" : status === 429 ? "tooMany" : status >= 500 || status === 0 ? "unavailable" : "generic";

export function Conversation({
  lang,
  dict,
  conversationId,
  initialMessages,
  firstName,
  initials,
  loadError = false,
  projectId,
  projectName,
}: {
  lang: Locale;
  dict: WorkspaceDict;
  conversationId: string | null;
  initialMessages: ChatMessage[];
  firstName: string | null;
  initials: string;
  loadError?: boolean;
  /** Nouvelle conversation démarrée depuis une page de projet (voir app/[lang]/app/page.tsx?project=). */
  projectId?: string;
  projectName?: string;
}) {
  const { upsertConversation, refreshConversations, refreshPending, setActivity, projectDraft, setProjectDraft } = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [busy, setBusy] = useState(false);
  // L'orbe de l'accueil « écoute » dès que l'utilisateur écrit.
  const [composing, setComposing] = useState(false);
  const conversationRef = useRef(conversationId);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Le fil reste collé en bas pendant la rédaction, sauf si l'utilisateur remonte lire.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string, files: File[], webSearch = false, mentions: MentionSelection = EMPTY_MENTIONS) => {
      const message = text.trim();
      if ((!message && !files.length) || busy) return;
      setBusy(true);
      stickToBottom.current = true;

      const assistantId = uid();
      let steps: Step[] = [{ id: uid(), key: files.length ? "files" : "read", status: "running", at: Date.now() }];
      const update = (patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
        setMessages((list) =>
          list.map((m) => (m.id === assistantId ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)),
        );
      const setSteps = (next: Step[], status: "running" | "done" | "error" = "running") => {
        steps = next;
        update({ steps: next });
        // Panneau d'activité : rien pour une question simple (lecture puis rédaction) ;
        // il ne s'ouvre que si DONNA cherche dans vos documents ou utilise un outil.
        const shown = visibleSteps(next);
        setActivity(shown.length ? { status, steps: shown } : { status: "idle", steps: [] });
      };
      const finishSteps = () => steps.map((s) => (s.status === "running" ? { ...s, status: "done" as const } : s));

      setMessages((list) => [
        ...list,
        { id: uid(), role: "user", content: message, createdAt: Date.now(), attachments: [], localFiles: files.map((f) => f.name) },
        { id: assistantId, role: "assistant", content: "", createdAt: Date.now(), attachments: [], steps, tools: [], status: "streaming" },
      ]);
      setActivity({ status: "running", steps });

      const controller = new AbortController();
      abortRef.current = controller;
      const isNew = conversationRef.current === null;
      let proposed = false;

      const onConversation = (id: string) => {
        if (!id || conversationRef.current) return;
        conversationRef.current = id;
        window.history.replaceState(null, "", `/${lang}/app/c/${id}`);
        upsertConversation({ id, title: (message || files[0]?.name || dict.meta.newTitle).slice(0, 60), created_at: new Date().toISOString() });
      };

      try {
        if (files.length) {
          // Fichiers joints : route non diffusée en continu (extraction, transcription, RAG).
          const form = new FormData();
          if (message) form.set("message", message);
          if (conversationRef.current) form.set("conversation_id", conversationRef.current);
          else if (projectId) form.set("project_id", projectId);
          if (webSearch) form.set("web_search", "true");
          if (mentions.projectId) form.set("mentioned_project_id", mentions.projectId);
          if (mentions.documentIds.length) form.set("mentioned_document_ids", JSON.stringify(mentions.documentIds));
          for (const file of files) form.append("files", file);
          const response = await fetch("/api/donna/chat/upload", { method: "POST", body: form, signal: controller.signal });
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
          onConversation(data.conversation_id);
          const tools: ToolCall[] = data.question
            ? [{ name: "ask_user", arguments: { question: data.question, options: data.options }, result: "" }]
            : [];
          setSteps([...finishSteps(), { id: uid(), key: "answer", status: "done", at: Date.now() }], "done");
          update({ content: data.reply, sources: data.sources, memory: data.memory_notes, attachments: data.attachments, tools, status: "done" });
        } else {
          const response = await fetch("/api/donna/chat/stream", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "text/event-stream" },
            body: JSON.stringify({
              message,
              conversation_id: conversationRef.current,
              project_id: conversationRef.current ? undefined : projectId,
              web_search: webSearch,
              mentioned_project_id: mentions.projectId,
              mentioned_document_ids: mentions.documentIds,
            }),
            signal: controller.signal,
          });
          if (!response.ok) throw Object.assign(new Error("http"), { kind: errorFromStatus(response.status) });

          let answering = false;
          let finished = false;
          for await (const event of readChatStream(response)) {
            if (event.type === "start") onConversation(event.conversationId);
            else if (event.type === "delta") {
              if (!answering) {
                answering = true;
                setSteps([...finishSteps(), { id: uid(), key: "answer", status: "running", at: Date.now() }]);
              }
              update((m) => ({ content: m.content + event.content }));
            } else if (event.type === "sources") {
              // Recherche documentaire effectuée avant l'ouverture du flux : étape rétroactive.
              update({ sources: event.sources });
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
              const index = steps.findLastIndex((s) => s.key === event.call.name && s.status === "running");
              setSteps(
                index >= 0
                  ? steps.map((s, i) => (i === index ? { ...s, status: "done" as const } : s))
                  : [...finishSteps(), { id: uid(), key: event.call.name, status: "done", at: Date.now() }],
              );
              update((m) => ({ tools: [...(m.tools ?? []), event.call] }));
            } else if (event.type === "error") {
              throw Object.assign(new Error("stream"), { kind: "generic" as ErrorKind });
            } else if (event.type === "done") {
              finished = true;
              setSteps(finishSteps(), "done");
              update({ sources: event.sources, memory: event.memory, attachments: event.attachments, status: "done" });
            }
          }
          if (!finished) throw Object.assign(new Error("interrupted"), { kind: "generic" as ErrorKind });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          setSteps(finishSteps(), "done");
          update({ status: "stopped" });
        } else {
          const kind = (error as { kind?: ErrorKind }).kind ?? "unavailable";
          setSteps(finishSteps(), "error");
          update({ status: "error", error: kind });
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
        if (proposed) void refreshPending();
        // Le titre définitif est généré en arrière-plan par le backend quelques secondes plus tard.
        if (isNew && conversationRef.current) window.setTimeout(() => void refreshConversations(), 6000);
      }
    },
    [busy, dict.meta.newTitle, lang, projectId, refreshConversations, refreshPending, setActivity, upsertConversation],
  );

  // Brouillon déposé depuis la page projet (project-detail.tsx, même Composer
  // que le chat) — consommé une seule fois au montage, jamais rejoué. En
  // mémoire (WorkspaceProvider), pas sessionStorage : un File ne se sérialise
  // pas, et /app/* garde le même provider tout au long de la navigation client.
  useEffect(() => {
    if (!projectId || !projectDraft) return;
    const { message, files, webSearch, mentions } = projectDraft;
    setProjectDraft(null);
    // queueMicrotask : évite d'appeler setState (via send) de façon synchrone
    // dans le corps de l'effet (react-hooks/set-state-in-effect).
    queueMicrotask(() => void send(message, files, webSearch, mentions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectDraft]);

  const retry = (index: number) => {
    const question = messages[index - 1];
    if (!question || question.role !== "user") return;
    setMessages((list) => list.filter((_, i) => i !== index && i !== index - 1));
    void send(question.content, []);
  };

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {projectId && projectName && (
        <Link
          href={`/${lang}/app/projects/${projectId}`}
          className="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-badge bg-peche-100 px-2.5 py-1 text-meta font-medium text-bordeaux-900 no-underline hover:bg-peche-100/70"
        >
          {projectName}
        </Link>
      )}
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-7 px-5 pt-8 pb-10 md:px-8">
          {loadError ? (
            <div className="mt-16 flex flex-col items-center gap-4 text-center">
              <p className="text-message text-ink-2">{dict.chat.loadError}</p>
              <Link href={`/${lang}/app`} className="rounded-button bg-bordeaux-700 px-4 py-2.5 text-label font-medium text-white no-underline hover:bg-bordeaux-900 hover:text-white">
                {dict.chat.backHome}
              </Link>
            </div>
          ) : empty ? (
            <EmptyState dict={dict} firstName={firstName} listening={composing} onPick={(text) => void send(text, [])} />
          ) : (
            messages.map((m, index) =>
              m.role === "user" ? (
                <UserMessage key={m.id} lang={lang} message={m} initials={initials} label={dict.chat.you} />
              ) : (
                <AssistantMessage
                  key={m.id}
                  lang={lang}
                  dict={dict}
                  message={m}
                  last={index === messages.length - 1}
                  busy={busy}
                  onAnswer={(text) => void send(text, [])}
                  onRetry={() => retry(index)}
                />
              ),
            )
          )}
        </div>
      </div>

      {!loadError && (
        <Composer
          dict={dict}
          busy={busy}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
          onComposingChange={setComposing}
          autoFocus={empty}
        />
      )}
    </div>
  );
}

/* ── Accueil d'une nouvelle conversation ─────────────────────────────────────────── */

function EmptyState({
  dict,
  firstName,
  listening,
  onPick,
}: {
  dict: WorkspaceDict;
  firstName: string | null;
  listening: boolean;
  onPick: (text: string) => void;
}) {
  return (
    <div className="mt-[10vh] flex flex-col items-center text-center">
      <DonnaOrb state={listening ? "listening" : "idle"} size={76} />
      <h1 className="mt-6 font-brand text-greeting font-light text-bordeaux-900">
        {firstName ? `${dict.chat.greeting} ${firstName},` : `${dict.chat.greeting},`}
      </h1>
      <p className="mt-1 text-panel-title text-ink-2">{dict.chat.prompt}</p>
      <ul className="mt-10 flex w-full max-w-[34rem] flex-col gap-2">
        {dict.chat.suggestions.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              onClick={() => onPick(suggestion)}
              className="w-full rounded-card border border-border bg-surface px-4 py-3 text-left text-label text-ink-2 transition-[border-color,color] duration-(--duration-fast) hover:border-bordeaux-700/30 hover:text-ink"
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Messages ────────────────────────────────────────────────────────────────────── */

function Time({ lang, at }: { lang: Locale; at: number | null }) {
  if (!at) return null;
  return (
    <time dateTime={new Date(at).toISOString()} className="text-meta text-ink-3 tabular-nums" suppressHydrationWarning>
      {new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(at)}
    </time>
  );
}

function UserMessage({ lang, message, initials, label }: { lang: Locale; message: ChatMessage; initials: string; label: string }) {
  const chip = "inline-flex items-center gap-1.5 rounded-badge bg-white px-2 py-1 text-meta text-ink-2";
  const hasFiles = Boolean(message.localFiles?.length || message.attachments.length);
  return (
    <div className="flex justify-end gap-3">
      <div className="flex max-w-[85%] flex-col items-end gap-1.5">
        <div className="rounded-panel rounded-tr-badge bg-active px-4 py-3">
          <p className="sr-only">{label} :</p>
          {message.content && <p className="text-message whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{message.content}</p>}
          {hasFiles && (
            <ul className={`flex flex-wrap gap-1.5 ${message.content ? "mt-2" : ""}`}>
              {message.localFiles?.map((name) => (
                <li key={`local-${name}`} className={chip}>
                  <FileIcon size={14} />
                  {name}
                </li>
              ))}
              {message.attachments.map((file) => (
                <li key={file.id}>
                  <FileLink url={fileHref(file.file_url)} name={file.original_name} className={`${chip} no-underline hover:text-ink`}>
                    <FileIcon size={14} />
                    {file.original_name}
                  </FileLink>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Time lang={lang} at={message.createdAt} />
      </div>
      <span aria-hidden className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-peche-100 text-meta font-medium text-bordeaux-900">
        {initials}
      </span>
    </div>
  );
}

function AssistantMessage({
  lang,
  dict,
  message,
  last,
  busy,
  onAnswer,
  onRetry,
}: {
  lang: Locale;
  dict: WorkspaceDict;
  message: ChatMessage;
  last: boolean;
  busy: boolean;
  onAnswer: (text: string) => void;
  onRetry: () => void;
}) {
  const { chat } = dict;
  const streaming = message.status === "streaming";
  const tools = message.tools ?? [];
  const question = tools.findLast((t) => t.name === "ask_user");
  const proposals = tools.filter((t) => PROPOSALS.has(t.name));

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center">
        {streaming ? (
          <DonnaOrb state={liveOrbState(message)} size={32} label="DONNA" />
        ) : (
          <DonnaMark size={28} variant="circle" label="DONNA" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {visibleSteps(message.steps ?? []).length > 0 && <StepsCard lang={lang} dict={dict} message={message} />}

        {message.content ? (
          <div aria-live={streaming ? "polite" : undefined}>
            <Markdown>{message.content}</Markdown>
            {streaming && <span aria-hidden className="demo-caret ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-bordeaux-700" />}
          </div>
        ) : null}

        {proposals.map((call) => (
          <ActionCard key={call.result} lang={lang} dict={dict} call={call} />
        ))}

        {question && (
          <QuestionCard dict={dict} call={question} disabled={busy || !last} onAnswer={onAnswer} />
        )}

        {message.attachments.length > 0 && (
          <div>
            <p className="text-meta text-ink-3">{chat.files}</p>
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {message.attachments.map((file) => (
                <li key={file.id}>
                  <FileLink
                    url={fileHref(file.file_url)}
                    name={file.original_name}
                    className="inline-flex items-center gap-2 rounded-button border border-border bg-white px-3 py-2 text-label text-ink no-underline hover:border-bordeaux-700/30 hover:text-ink"
                  >
                    <FileIcon size={16} className="text-bordeaux-700" />
                    {file.original_name}
                  </FileLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        {message.sources && message.sources.length > 0 && <Sources dict={dict} sources={message.sources} />}

        {message.memory && message.memory.length > 0 && (
          <p className="inline-flex items-start gap-1.5 text-secondary text-ink-2">
            <CheckIcon size={15} className="mt-px shrink-0 text-success" />
            <span>
              {chat.memory} : {message.memory.join(" · ")}
            </span>
          </p>
        )}

        {message.status === "stopped" && <p className="text-secondary text-ink-3">{chat.stopped}</p>}
        {message.status === "error" && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-danger/[0.06] px-3.5 py-2.5 text-label text-danger">
            <span>
              {message.error === "session"
                ? chat.errorSession
                : message.error === "tooMany"
                  ? chat.errorTooMany
                  : message.error === "unavailable"
                    ? chat.errorUnavailable
                    : chat.errorGeneric}
            </span>
            {message.error === "session" ? (
              <Link href={`/${lang}/login?next=/${lang}/app`} className="font-medium text-danger underline hover:text-danger">
                {dict.panel.connect}
              </Link>
            ) : (
              last &&
              !busy && (
                <button type="button" onClick={onRetry} className="font-medium underline">
                  {chat.retry}
                </button>
              )
            )}
          </div>
        )}

        {!streaming && <Time lang={lang} at={message.createdAt} />}
      </div>
    </div>
  );
}

/** État de l'orbe pendant une réponse : elle réfléchit, agit (outil en cours), puis répond. */
function liveOrbState(message: ChatMessage): OrbState {
  const running = (message.steps ?? []).find((step) => step.status === "running");
  if (running && running.key !== "read" && running.key !== "answer") return "working";
  if (message.content) return "answering";
  return "thinking";
}

/** Étapes réelles du traitement (événements du flux), repliables une fois terminé. */
function StepsCard({ lang, dict, message }: { lang: Locale; dict: WorkspaceDict; message: ChatMessage }) {
  const streaming = message.status === "streaming";
  const [open, setOpen] = useState(true);
  const steps = visibleSteps(message.steps ?? []);
  const expanded = streaming || open;

  return (
    <div className="rounded-panel bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-label font-medium text-ink">{streaming ? dict.chat.working : dict.chat.done}</p>
        {!streaming && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-meta text-ink-2 hover:text-ink"
          >
            {open ? dict.chat.hideSteps : dict.chat.stepsCount.replace("{n}", String(steps.length))}
            <ChevronIcon size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {expanded && (
        <ol className="flex flex-col gap-2 border-t border-border px-4 py-3">
          {steps.map((step) => (
            <li key={step.id} className="flex items-center gap-2.5 text-secondary">
              <StepDot status={step.status} />
              <span className={`flex-1 ${step.status === "done" ? "text-ink-2" : "text-ink"}`}>{stepLabel(dict, step.key)}</span>
              <Time lang={lang} at={step.at} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Brouillon proposé par DONNA (email ou agenda) : rien ne part sans validation. */
function ActionCard({ lang, dict, call }: { lang: Locale; dict: WorkspaceDict; call: ToolCall }) {
  const { pending, decisions, decideAction } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = actionIdFrom(call.result);
  if (!id) return null;

  const decision = decisions[id];
  const awaiting = !decision && pending.some((a) => a.id === id);
  const args = call.arguments;
  const isEmail = call.name === "propose_email";
  const eventAction = text(args.action) as keyof WorkspaceDict["chat"]["eventActions"];
  const when = [text(args.start_datetime), text(args.end_datetime)]
    .filter(Boolean)
    .map((value) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? value
        : new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
    })
    .join(" → ");

  const decide = async (choice: "confirm" | "cancel") => {
    setBusy(true);
    setFailed(false);
    const ok = await decideAction(id, choice);
    setBusy(false);
    setFailed(!ok);
  };

  return (
    <div className="rounded-panel border border-border bg-ivoire-50 p-4">
      <div className="flex items-center justify-between gap-3 text-meta">
        <span className="font-medium text-ink">{isEmail ? dict.chat.draftEmail : dict.chat.draftEvent}</span>
        {decision ? (
          <span className={`inline-flex items-center gap-1 ${decision === "confirm" ? "text-success-ink" : "text-ink-3"}`}>
            {decision === "confirm" ? <CheckIcon size={14} /> : <CloseIcon size={14} />}
            {decision === "confirm" ? dict.panel.approved : dict.panel.declined}
          </span>
        ) : (
          awaiting && (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-bordeaux-700">
              <span className="pending-dot size-1.5 rounded-full bg-bordeaux-700" />
              {dict.chat.awaiting}
            </span>
          )
        )}
      </div>
      {isEmail ? (
        <>
          <p className="mt-3 text-meta text-ink-3">
            {dict.chat.to} : {text(args.to)}
          </p>
          <p className="mt-0.5 text-label font-medium text-ink">{text(args.subject)}</p>
          <p className="mt-2 text-secondary leading-5 whitespace-pre-wrap text-ink-2">{text(args.body)}</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-meta text-ink-3">{dict.chat.eventActions[eventAction] ?? eventAction}</p>
          {text(args.title) && <p className="mt-0.5 text-label font-medium text-ink">{text(args.title)}</p>}
          {when && <p className="mt-1 text-secondary text-ink-2">{when}</p>}
          {text(args.description) && <p className="mt-2 text-secondary whitespace-pre-wrap text-ink-2">{text(args.description)}</p>}
        </>
      )}
      {failed && <p className="mt-3 text-secondary text-danger">{dict.panel.actionError}</p>}
      {awaiting && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("confirm")}
            className="rounded-button bg-bordeaux-700 px-3.5 py-2 text-label font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60"
          >
            {dict.panel.approve}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("cancel")}
            className="rounded-button bg-fill px-3.5 py-2 text-label font-medium text-ink hover:bg-active disabled:opacity-60"
          >
            {dict.panel.decline}
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  dict,
  call,
  disabled,
  onAnswer,
}: {
  dict: WorkspaceDict;
  call: ToolCall;
  disabled: boolean;
  onAnswer: (text: string) => void;
}) {
  const options = Array.isArray(call.arguments.options) ? (call.arguments.options as unknown[]).map(String) : [];
  return (
    <div className="rounded-panel border border-rose-300/60 bg-white p-4">
      <p className="text-meta text-bordeaux-700">{dict.chat.questionLabel}</p>
      <p className="mt-1 text-message text-ink">{text(call.arguments.question)}</p>
      {options.length > 0 && (
        <div role="group" aria-label={dict.chat.optionsLabel} className="mt-3 flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onAnswer(option)}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-label text-ink hover:border-bordeaux-700/40 hover:bg-white disabled:opacity-50"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sources({ dict, sources }: { dict: WorkspaceDict; sources: SourceOut[] }) {
  // Un document peut apparaître plusieurs fois (plusieurs extraits) : une puce par document.
  const unique = sources.filter((s, i) => sources.findIndex((o) => o.doc_id === s.doc_id) === i);
  return (
    <div>
      <p className="text-meta text-ink-3">{dict.chat.sources}</p>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {unique.map((source) => (
          <li key={source.doc_id}>
            <FileLink
              url={fileHref(source.file_url)}
              name={source.original_name}
              title={source.excerpt}
              className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-meta text-ink-2 no-underline hover:border-bordeaux-700/30 hover:text-ink"
            >
              <FileIcon size={14} className="shrink-0 text-bordeaux-700" />
              <span className="truncate">{source.original_name}</span>
            </FileLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Zone de saisie ──────────────────────────────────────────────────────────────── */

type MenuState = { trigger: "@" | "/"; query: string; start: number; kind?: MentionKind };
/** Données pures (pas de closure) — la sélection réelle passe par
 * handleMenuSelect, seul point où l'on touche les refs (textareaRef via
 * focusAt), pour rester dans un vrai gestionnaire d'événement plutôt que
 * dans une valeur calculée pendant le rendu (react-hooks/refs). */
type MenuAction =
  | { type: "mention"; mention: Mention }
  | { type: "web" }
  | { type: "clear" }
  | { type: "shortcut"; kind: MentionKind };
type MenuItem = { id: string; label: string; kind: "project" | "document" | "command"; action: MenuAction };

/** Repère un déclencheur "@"/"/" en cours de frappe juste avant le curseur —
 * précédé d'un début de chaîne ou d'un espace, sans espace entre lui et le
 * curseur (sinon ce n'est plus le même "mot"). Pas de suivi de position en
 * pixels : le menu s'ancre au-dessus du composer, pas au curseur (voir
 * le rendu plus bas — simplification délibérée, textarea plein texte). */
function detectTrigger(value: string, caret: number): { trigger: "@" | "/"; query: string; start: number } | null {
  const head = value.slice(0, caret);
  const match = /(?:^|\s)([@/])([^\s@/]*)$/.exec(head);
  if (!match) return null;
  const query = match[2];
  return { trigger: match[1] as "@" | "/", query, start: caret - query.length - 1 };
}

export function Composer({
  dict,
  busy,
  onSend,
  onStop,
  onComposingChange,
  autoFocus,
}: {
  dict: WorkspaceDict;
  busy: boolean;
  onSend: (text: string, files: File[], webSearch: boolean, mentions: MentionSelection) => Promise<void>;
  onStop: () => void;
  onComposingChange?: (composing: boolean) => void;
  autoFocus: boolean;
}) {
  const { projects } = useWorkspace();
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  // Reste actif d'un message à l'autre, jusqu'à ce que l'utilisateur le désactive.
  const [webSearch, setWebSearch] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState<"permission" | "transcribe" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Commandes "/" et mentions "@" — voir detectTrigger ci-dessus. `mentions`
  // trace ce qui a été inséré ({id, label: "@Nom", kind}) ; au moment
  // d'envoyer, seules celles dont le libellé est encore présent dans le
  // texte comptent (texte brut, pas de puce — un backspace suffit à retirer
  // une mention). Un seul projet mentionné à la fois, comme le backend
  // (mentioned_project_id est singulier).
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [personalDocs, setPersonalDocs] = useState<PersonalDocumentOut[] | null>(null);
  const docsFetchedRef = useRef(false);

  const ensurePersonalDocs = useCallback(() => {
    if (docsFetchedRef.current) return;
    docsFetchedRef.current = true;
    void (async () => {
      try {
        const response = await fetch("/api/donna/rag/documents", { cache: "no-store" });
        if (response.ok) setPersonalDocs((await response.json()) as PersonalDocumentOut[]);
      } catch {
        // Silencieux — le menu @ retombe sur les projets seuls.
      }
    })();
  }, []);

  const syncMenu = useCallback(
    (nextValue: string, caret: number) => {
      const trigger = detectTrigger(nextValue, caret);
      if (!trigger) {
        setMenu(null);
        return;
      }
      setMenu((prev) => ({
        ...trigger,
        // Le type forcé par un raccourci /project ou /document (voir plus bas)
        // survit tant que le déclencheur reste le même "@" en cours de frappe.
        kind: prev && prev.trigger === "@" && prev.start === trigger.start ? prev.kind : undefined,
      }));
      setActiveIndex(0);
      if (trigger.trigger === "@") ensurePersonalDocs();
    },
    [ensurePersonalDocs],
  );

  const focusAt = useCallback((pos: number) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }, []);

  const insertToken = useCallback(
    (token: string) => {
      if (!menu) return;
      const end = menu.start + 1 + menu.query.length;
      const before = value.slice(0, menu.start);
      const after = value.slice(end);
      setValue(`${before}${token}${after}`);
      setMenu(null);
      focusAt(before.length + token.length);
    },
    [menu, value, focusAt],
  );

  const selectMention = useCallback(
    (item: Mention) => {
      insertToken(`${item.label} `);
      setMentions((list) => {
        const withoutId = list.filter((m) => m.id !== item.id);
        return item.kind === "project" ? [...withoutId.filter((m) => m.kind !== "project"), item] : [...withoutId, item];
      });
    },
    [insertToken],
  );

  const runSlashShortcut = useCallback(
    (kind: MentionKind) => {
      if (!menu) return;
      const end = menu.start + 1 + menu.query.length;
      const before = value.slice(0, menu.start);
      const after = value.slice(end);
      setValue(`${before}@${after}`);
      setMenu({ trigger: "@", query: "", start: before.length, kind });
      setActiveIndex(0);
      ensurePersonalDocs();
      focusAt(before.length + 1);
    },
    [menu, value, ensurePersonalDocs, focusAt],
  );

  const menuItems: MenuItem[] = useMemo(() => {
    if (!menu) return [];
    if (menu.trigger === "/") {
      const commands: MenuItem[] = [
        { id: "web", label: dict.chat.cmdWeb, kind: "command", action: { type: "web" } },
        { id: "clear", label: dict.chat.cmdClear, kind: "command", action: { type: "clear" } },
        { id: "project", label: dict.chat.cmdProject, kind: "command", action: { type: "shortcut", kind: "project" } },
        { id: "document", label: dict.chat.cmdDocument, kind: "command", action: { type: "shortcut", kind: "document" } },
      ];
      return commands.filter((item) => !menu.query || item.label.toLowerCase().includes(menu.query.toLowerCase()));
    }
    const q = menu.query.trim().toLowerCase();
    const items: MenuItem[] = [];
    if (menu.kind !== "document") {
      for (const p of projects) {
        if (q && !p.name.toLowerCase().includes(q)) continue;
        const mention: Mention = { id: p.id, label: `@${p.name}`, kind: "project" };
        items.push({ id: `project:${p.id}`, label: mention.label, kind: "project", action: { type: "mention", mention } });
      }
    }
    if (menu.kind !== "project") {
      for (const d of personalDocs ?? []) {
        if (q && !d.original_name.toLowerCase().includes(q)) continue;
        const mention: Mention = { id: d.id, label: `@${d.original_name}`, kind: "document" };
        items.push({ id: `document:${d.id}`, label: mention.label, kind: "document", action: { type: "mention", mention } });
      }
    }
    return items.slice(0, 8);
  }, [menu, projects, personalDocs, dict.chat]);

  // Seul point d'exécution réel des actions du menu — appelé depuis de vrais
  // gestionnaires d'événement (onClick, Entrée), jamais pendant le rendu :
  // c'est ici, et seulement ici, que les refs (via insertToken/focusAt) sont
  // effectivement touchées.
  const handleMenuSelect = useCallback(
    (item: MenuItem) => {
      switch (item.action.type) {
        case "mention":
          selectMention(item.action.mention);
          break;
        case "web":
          setWebSearch((v) => !v);
          insertToken("");
          break;
        case "clear":
          setValue("");
          setFiles([]);
          setMentions([]);
          setMenu(null);
          break;
        case "shortcut":
          runSlashShortcut(item.action.kind);
          break;
      }
    },
    [selectMention, insertToken, runSlashShortcut],
  );

  // Délégation d'événement sur le <ul> plutôt qu'un onClick recréé à chaque
  // itération du .map() ci-dessous — un handler stable (useCallback) évite
  // que react-hooks/refs voie une fermeture touchant une ref (via
  // handleMenuSelect) recréée pendant le rendu de la liste.
  const handleMenuListClick = useCallback(
    (event: React.MouseEvent<HTMLUListElement>) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-item-id]");
      const id = row?.dataset.itemId;
      const item = menuItems.find((m) => m.id === id);
      if (item) handleMenuSelect(item);
    },
    [menuItems, handleMenuSelect],
  );

  // Micro du composer — transcription via /app/chat/transcribe (Whisper
  // local, voir backend/app/chat/src/transcribe.py). Le texte reconnu vient
  // compléter la saisie, jamais envoyé automatiquement : l'utilisateur
  // relit/édite avant d'envoyer, comme tout ce qu'il tape lui-même.
  const stopTracks = () => {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  };

  useEffect(() => stopTracks, []);

  const handleRecordingStop = useCallback(async () => {
    const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || "audio/webm" });
    audioChunksRef.current = [];
    if (!blob.size) return;
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      const response = await fetch("/api/donna/chat/transcribe", { method: "POST", body: form });
      if (!response.ok) throw new Error();
      const { text } = (await response.json()) as { text: string };
      if (text) setValue((current) => (current.trim() ? `${current.trim()} ${text}` : text));
    } catch {
      setMicError("transcribe");
    } finally {
      setTranscribing(false);
    }
  }, []);

  const toggleRecording = async () => {
    if (transcribing) return;
    if (recording) {
      mediaRecorderRef.current?.stop();
      stopTracks();
      setRecording(false);
      return;
    }
    setMicError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("permission");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => void handleRecordingStop();
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setMicError("permission");
    }
  };

  // Hauteur ajustée au contenu, plafonnée (défilement au-delà).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const submit = () => {
    if (busy || (!value.trim() && !files.length)) return;
    const [text, attached] = [value, files];
    const activeMentions = mentions.filter((m) => text.includes(m.label));
    const selection: MentionSelection = {
      documentIds: activeMentions.filter((m) => m.kind === "document").map((m) => m.id),
      projectId: activeMentions.find((m) => m.kind === "project")?.id ?? null,
    };
    setValue("");
    setFiles([]);
    setMentions([]);
    setMenu(null);
    onComposingChange?.(false);
    void onSend(text, attached, webSearch, selection);
  };

  const canSend = !busy && (value.trim().length > 0 || files.length > 0);

  return (
    <div className="px-4 pb-4 md:px-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="relative mx-auto w-full max-w-[46rem] rounded-panel border border-border bg-white shadow-float focus-within:border-bordeaux-700/40"
      >
        {menu && (
          <ul
            role="listbox"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleMenuListClick}
            className="scrollbar-none absolute bottom-full left-0 right-0 z-10 mb-2 max-h-64 overflow-y-auto rounded-panel border border-border bg-white p-1.5 shadow-float"
          >
            {menuItems.length ? (
              menuItems.map((item, index) => (
                <li
                  key={item.id}
                  data-item-id={item.id}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center gap-2 rounded-nav px-2.5 py-2 text-label ${
                    index === activeIndex ? "bg-active text-ink" : "text-ink-2"
                  }`}
                >
                  {item.kind === "project" && <FolderIcon size={16} className="shrink-0 text-bordeaux-700" />}
                  {item.kind === "document" && <FileIcon size={16} className="shrink-0 text-ink-3" />}
                  <span className="truncate">{item.label}</span>
                </li>
              ))
            ) : (
              <li className="px-2.5 py-2 text-label text-ink-3">{dict.chat.mentionNoResults}</li>
            )}
          </ul>
        )}
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-4 pt-3">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="inline-flex items-center gap-1.5 rounded-badge bg-active py-1 pr-1 pl-2 text-meta text-ink-2">
                <FileIcon size={14} />
                <span className="max-w-[12rem] truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={`${dict.chat.removeFile} ${file.name}`}
                  onClick={() => setFiles((list) => list.filter((_, i) => i !== index))}
                  className="flex size-5 items-center justify-center rounded-badge hover:bg-white hover:text-ink"
                >
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor="composer" className="sr-only">
          {dict.chat.placeholder}
        </label>
        <textarea
          id="composer"
          ref={textareaRef}
          rows={1}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            syncMenu(event.target.value, event.target.selectionStart ?? event.target.value.length);
            onComposingChange?.(event.target.value.trim().length > 0);
          }}
          onKeyDown={(event) => {
            if (menu && menuItems.length) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((i) => (i + 1) % menuItems.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                const item = menuItems[activeIndex];
                if (item) handleMenuSelect(item);
                return;
              }
            }
            if (menu && event.key === "Escape") {
              event.preventDefault();
              setMenu(null);
              return;
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          onBlur={() => setMenu(null)}
          placeholder={dict.chat.placeholder}
          className="scrollbar-none block max-h-[220px] w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-message text-ink outline-none placeholder:text-ink-3 focus-visible:shadow-none"
        />
        <div className="flex items-center justify-between px-2.5 pb-2.5">
          <div className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? []);
                setFiles((list) => [...list, ...picked].slice(0, MAX_FILES));
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              aria-label={dict.chat.attach}
              title={dict.chat.attach}
              className="flex size-9 items-center justify-center rounded-button text-ink-2 hover:bg-active hover:text-ink disabled:opacity-50"
            >
              <PaperclipIcon size={19} />
            </button>
            <button
              type="button"
              disabled={busy || transcribing}
              onClick={() => void toggleRecording()}
              aria-pressed={recording}
              aria-label={recording ? dict.chat.micStop : dict.chat.micStart}
              title={recording ? dict.chat.micStop : dict.chat.micStart}
              className={`flex size-9 items-center justify-center rounded-button transition-colors disabled:opacity-50 ${
                recording ? "animate-pulse bg-danger/10 text-danger" : "text-ink-2 hover:bg-active hover:text-ink"
              }`}
            >
              <MicIcon size={18} />
            </button>
            <button
              type="button"
              onClick={() => setWebSearch((v) => !v)}
              aria-pressed={webSearch}
              title={webSearch ? dict.chat.webSearchOn : dict.chat.webSearchOff}
              className={`inline-flex h-9 items-center gap-1.5 rounded-button px-2.5 text-label transition-colors ${
                webSearch ? "bg-bordeaux-700/10 font-medium text-bordeaux-700" : "text-ink-2 hover:bg-active hover:text-ink"
              }`}
            >
              <GlobeIcon size={18} />
              <span className={webSearch ? "" : "sr-only"}>{dict.chat.webSearch}</span>
            </button>
          </div>
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label={dict.chat.stop}
              title={dict.chat.stop}
              className="flex size-9 items-center justify-center rounded-button bg-ink text-white hover:bg-bordeaux-900"
            >
              <StopIcon size={16} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label={dict.chat.send}
              title={dict.chat.send}
              className="flex size-9 items-center justify-center rounded-button bg-bordeaux-700 text-white transition-colors hover:bg-bordeaux-900 disabled:bg-pending disabled:text-ink-3"
            >
              <SendIcon size={18} />
            </button>
          )}
        </div>
      </form>
      {transcribing && <p className="mt-2 text-center text-meta text-ink-3">{dict.chat.micTranscribing}</p>}
      {micError && (
        <p className="mt-2 text-center text-meta text-danger">
          {micError === "permission" ? dict.chat.micPermissionError : dict.chat.micTranscribeError}
        </p>
      )}
      <p className="mt-2 text-center text-meta text-ink-3">{dict.chat.disclaimer}</p>
    </div>
  );
}
