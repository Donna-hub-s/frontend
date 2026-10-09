"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { DonnaMark } from "@/components/brand/donna-mark";
import { DonnaOrb, type OrbState } from "@/components/brand/donna-orb";
import { FileLink } from "./file-viewer";
import { actionIdFrom } from "@/lib/chat-stream";
import { EMPTY_MENTIONS, PROPOSALS, uid, visibleSteps } from "@/lib/chat-run";
import { inlineImageNames, isImageName } from "@/lib/file-links";
import { readableExcerpt } from "@/lib/source-excerpt";
import { visibleSources } from "@/lib/sources";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";
import {
  fileHref,
  type ChatMessage,
  type Mention,
  type MentionKind,
  type MentionSelection,
  type AccessibleDocumentOut,
  type PendingActionOut,
  type SourceOut,
  type ToolCall,
} from "@/lib/workspace-types";
import { CheckIcon, ChevronIcon, CloseIcon, FileIcon, FolderIcon, GlobeIcon, MicIcon, PaperclipIcon, PencilIcon, PlusIcon, SendIcon, SpeakerIcon, StopIcon } from "./icons";
import { Markdown, type MarkdownFile } from "./markdown";
import { FeedbackBar } from "./feedback-bar";
import { RegenerateButton, VersionNav } from "./version-nav";
import { LinkCard, linkCardData } from "./link-card";
import { CanvasHost } from "./canvas-panel";
import { VoiceBar, VoiceStartButton } from "./voice-bar";
import { useVoiceMode } from "@/lib/use-voice-mode";
import { ResearchProgress } from "./research-progress";
import { estimateText, formatUsd, type ResearchRun } from "@/lib/research";
import { downloadDriveFiles, type DriveFileOut } from "@/lib/drive";
import { EmailAttachmentList } from "./email-attachments";
import { AgentMenu, AgentReviewDialog } from "./agent-menu";
import { markSeen, needsReview, readSeen, type AgentOut } from "@/lib/agents";
import { useProjectAgents } from "@/lib/use-project-agents";
import { Bot, Image as ImageIcon, Sparkles } from "lucide-react";
import { WorkflowDraft } from "./workflow-draft";
import { useConversationContext } from "@/lib/use-conversation-context";
import { GoogleDriveIcon } from "./brand-icons";
import { ContextMenu } from "./context-menu";
import { ModelMenu } from "./model-menu";
import { SkillsMenu } from "./skills-menu";
import { DrivePicker } from "./drive-picker";
import { StepDot, stepDetail, stepLabel } from "./side-panel";
import { useWorkspace } from "./workspace-provider";

type WorkspaceDict = Dictionary["workspace"];

// Même plafond que DONNA_MAX_FILES_PER_REQUEST côté backend (10 par défaut).
const MAX_FILES = 10;

/** Image affichable en attente d'envoi : MIME image (SVG exclu, comme partout ailleurs), sinon extension. */
const PENDING_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"]);
const pendingIsImage = (file: File): boolean => PENDING_IMAGE_MIMES.has(file.type.toLowerCase()) || isImageName(file.name);

/** Vignette d'un fichier en attente : l'URL objet n'existe que tant que la vignette est montée. */
function PendingThumb({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element -- fichier local choisi par l'utilisateur, dimensions inconnues
  return <img src={url} alt={file.name} loading="lazy" className="aspect-square w-full bg-surface object-cover" />;
}

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
  initialAgentId,
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
  /** Agent présélectionné pour une nouvelle conversation de projet (lien « Essayer » d'un agent : ?agent=). */
  initialAgentId?: string;
}) {
  const {
    send: sendRun,
    stop,
    dropMessages,
    patchMessage,
    regenerate,
    selectBranch,
    threads,
    registerThread,
    releaseThread,
    resolveThreadKey,
    setActiveKey,
    markRead,
    projectDraft,
    setProjectDraft,
    conversations,
  } = useWorkspace();
  // Fil du provider : l'identifiant de conversation, ou un identifiant local
  // stable tant que le backend ne l'a pas créée. Le fil survit au démontage,
  // donc un flux continue quand l'utilisateur ouvre une autre conversation.
  // Après une création, l'URL bascule sur /c/<id> et la route remonte ce
  // composant : resolveThreadKey rattrape alors la clé locale qui porte le flux,
  // sinon la vue repartirait d'un fil vide jusqu'au prochain rechargement.
  const [localKey] = useState(uid);
  const threadKey = conversationId ? resolveThreadKey(conversationId) : localKey;

  const thread = threads[threadKey];
  const messages = thread?.messages ?? initialMessages;
  const busy = thread?.busy ?? false;
  // Agent du projet : son projet est celui de la conversation (page projet ou liste des conversations), son choix suit la
  // conversation. `picked` : undefined tant que l'utilisateur n'a rien choisi ici (on lit alors la conversation, ou le lien).
  const liveConversationId = thread?.conversationId ?? conversationId;
  const conversation = liveConversationId ? conversations.find((c) => c.id === liveConversationId) : undefined;
  const agentProjectId = projectId ?? conversation?.project_id ?? null;
  const [pickedAgent, setPickedAgent] = useState<string | null | undefined>(undefined);
  const selectedAgentId = pickedAgent !== undefined ? pickedAgent : (conversation?.agent_id ?? initialAgentId ?? null);
  const { agents: projectAgents } = useProjectAgents(agentProjectId);
  const selectedAgent = projectAgents?.find((a) => a.id === selectedAgentId) ?? null;
  // L'orbe de l'accueil « écoute » dès que l'utilisateur écrit.
  const [composing, setComposing] = useState(false);
  // Le collage en bas repart à chaque conversation (resetKey), pas à chaque
  // changement de route.
  const { scrollRef, contentRef, pending: unseenBelow, toBottom, onScroll, stick } = useStickToBottom(conversationId);

  // Déclaration du fil et conversation à l'écran : c'est elle qui alimente le
  // panneau d'activité et qui est considérée comme lue. Le nettoyage NE coupe
  // surtout pas le flux, qui vit dans le provider.
  useEffect(() => {
    registerThread(threadKey, conversationId, initialMessages);
    setActiveKey(threadKey);
    markRead(threadKey);
    return () => {
      setActiveKey(null);
      releaseThread(threadKey);
    };
    // `initialMessages` n'est lu qu'à la déclaration : le rejouer écraserait le fil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey, conversationId, setActiveKey, markRead, releaseThread, registerThread]);

  const send = useCallback(
    async (text: string, files: File[], webSearch = false, mentions: MentionSelection = EMPTY_MENTIONS, agentOverride?: string | null, voice = false) => {
      const message = text.trim();
      if ((!message && !files.length) || busy) return;
      stick();
      const agent = agentOverride !== undefined ? agentOverride : selectedAgentId;
      await sendRun({
        key: threadKey,
        message,
        files,
        webSearch,
        mentions,
        voice,
        // Le fil connaît déjà l'id si le backend l'a créé lors d'un envoi précédent.
        conversationId: thread?.conversationId ?? conversationId,
        projectId,
        // Dans un projet, on envoie TOUJOURS le choix (« » = aucun) : c'est ce qui retire un agent devenu indisponible.
        agentId: agentProjectId ? (agent ?? "") : undefined,
        lang,
        fallbackTitle: message || files[0]?.name || dict.meta.newTitle,
      });
    },
    [agentProjectId, busy, conversationId, dict.meta.newTitle, lang, projectId, selectedAgentId, sendRun, stick, thread?.conversationId, threadKey],
  );


  // Brouillon déposé depuis la page projet (project-detail.tsx, même Composer
  // que le chat) — consommé une seule fois au montage, jamais rejoué. En
  // mémoire (WorkspaceProvider), pas sessionStorage : un File ne se sérialise
  // pas, et /app/* garde le même provider tout au long de la navigation client.
  useEffect(() => {
    if (!projectId || !projectDraft) return;
    const { message, files, webSearch, mentions, agentId } = projectDraft;
    setProjectDraft(null);
    // queueMicrotask : évite d'appeler setState (via send) de façon synchrone
    // dans le corps de l'effet (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      setPickedAgent(agentId ?? null);
      void send(message, files, webSearch, mentions, agentId ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectDraft]);

  const retry = (index: number) => {
    const question = messages[index - 1];
    if (!question || question.role !== "user") return;
    dropMessages(threadKey, [index, index - 1]);
    void send(question.content, []);
  };

  // Un seul message éditable à la fois (voir UserMessage::canEdit et Composer busy ci-dessous).
  const [editingId, setEditingId] = useState<string | null>(null);

  const editAndResend = (index: number, text: string) => {
    const target = messages[index];
    const trimmed = text.trim();
    if (!target?.serverId || !trimmed || trimmed === target.content) {
      setEditingId(null);
      return;
    }
    // Tout ce qui suit (y compris l'ancienne réponse) disparaît de l'AFFICHAGE : la branche
    // d'origine reste atteignable via la navigation de versions (voir branches.py).
    dropMessages(threadKey, Array.from({ length: messages.length - index }, (_, i) => index + i));
    setEditingId(null);
    void sendRun({
      key: threadKey,
      message: trimmed,
      files: [],
      webSearch: false,
      mentions: EMPTY_MENTIONS,
      conversationId: thread?.conversationId ?? conversationId,
      projectId,
      agentId: agentProjectId ? (selectedAgentId ?? "") : undefined,
      editing: { messageId: target.serverId, siblingIds: target.siblingIds ?? [] },
      lang,
      fallbackTitle: trimmed || dict.meta.newTitle,
    });
  };

  const regenerateAnswer = (index: number): Promise<boolean> => {
    const target = messages[index];
    const convId = thread?.conversationId ?? conversationId;
    if (!target?.serverId || !convId) return Promise.resolve(false);
    return regenerate(threadKey, convId, target);
  };

  const selectVersion = (messageId: string): Promise<boolean> => {
    const convId = thread?.conversationId ?? conversationId;
    if (!convId) return Promise.resolve(false);
    // Le message en cours d'édition peut ne plus exister dans la branche qu'on affiche ensuite.
    setEditingId(null);
    return selectBranch(threadKey, convId, messageId);
  };

  // Mode vocal : ce que la personne dit part comme un message écrit (mêmes outils, mêmes droits) ; la réponse est lue phrase par phrase.
  // Le repère rendu est le nombre de messages avant l'envoi : la réponse à lire est la première de DONNA qui le suit.
  const voice = useVoiceMode({
    lang,
    messages,
    onUtterance: (spoken) => {
      if (busy) return null;
      const before = messages.length;
      void send(spoken, [], false, EMPTY_MENTIONS, undefined, true);
      return before;
    },
    onInterrupt: () => stop(threadKey),
  });
  const voiceOn = voice.state.phase !== "off";

  const empty = messages.length === 0;
  // Accueil générique (hors projet) : bandeau resserré + raccourcis plutôt que la liste de suggestions des agents de projet.
  const homeScreen = empty && !agentProjectId;

  return (
    <CanvasHost lang={lang} labels={dict.canvas} conversationId={liveConversationId} messages={messages}>
    <div className="flex min-h-0 flex-1 flex-col">
      {((projectId && projectName) || selectedAgent) && (
        <div className="mx-auto mt-3 flex w-fit flex-wrap items-center justify-center gap-2">
          {projectId && projectName && (
            <Link
              href={`/${lang}/app/projects/${projectId}`}
              className="flex w-fit items-center gap-1.5 rounded-badge bg-peche-100 px-2.5 py-1 text-meta font-medium text-brand-strong no-underline hover:bg-peche-100/70"
            >
              {projectName}
            </Link>
          )}
          {selectedAgent && (
            <span
              title={selectedAgent.description ?? undefined}
              className="flex w-fit items-center gap-1.5 rounded-badge bg-brand/10 px-2.5 py-1 text-meta font-medium text-brand"
            >
              <Bot size={13} aria-hidden />
              <span className="sr-only">{dict.agents.menuTitle} : </span>
              {selectedAgent.name}
            </span>
          )}
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto"
      >
        <div ref={contentRef} className="mx-auto flex w-full max-w-[46rem] flex-col gap-7 px-5 pt-8 pb-10 md:px-8">
          {loadError ? (
            <div className="mt-16 flex flex-col items-center gap-4 text-center">
              <p className="text-message text-ink-2">{dict.chat.loadError}</p>
              <Link href={`/${lang}/app`} className="rounded-button bg-brand-fill px-4 py-2.5 text-label font-medium text-white no-underline hover:bg-brand-fill-strong hover:text-white">
                {dict.chat.backHome}
              </Link>
            </div>
          ) : homeScreen ? (
            <div className="mt-[10vh] flex flex-col items-center">
              <h1 className="msg-enter max-w-[34rem] text-center font-brand text-greeting font-light text-brand-strong text-pretty">
                {firstName ? dict.chat.homeTitleName.replace("{name}", firstName) : dict.chat.homeTitle}
              </h1>
              <div className="mt-6 w-full" hidden={voiceOn}>
                <Composer
                  lang={lang}
                  dict={dict}
                  busy={busy || editingId !== null}
                  conversationId={thread?.conversationId ?? conversationId}
                  onSend={send}
                  onStop={() => stop(threadKey)}
                  onComposingChange={setComposing}
                  autoFocus
                  onStartVoice={() => void voice.start()}
                  variant="home"
                />
              </div>
            </div>
          ) : empty ? (
            <EmptyState
              dict={dict}
              firstName={firstName}
              listening={composing}
              suggestions={selectedAgent?.starters.length ? selectedAgent.starters : dict.chat.suggestions}
              onPick={(text) => void send(text, [])}
            />
          ) : (
            messages.map((m, index) =>
              m.role === "user" ? (
                <UserMessage
                  key={m.id}
                  lang={lang}
                  message={m}
                  initials={initials}
                  label={dict.chat.you}
                  chat={dict.chat}
                  conversationId={liveConversationId}
                  editing={editingId === m.id}
                  canEdit={Boolean(m.serverId) && !m.attachments.length && !m.localFiles?.length && !busy && editingId === null}
                  onStartEdit={() => setEditingId(m.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(text) => editAndResend(index, text)}
                  onSelectVersion={selectVersion}
                />
              ) : (
                <AssistantMessage
                  key={m.id}
                  lang={lang}
                  dict={dict}
                  message={m}
                  last={index === messages.length - 1}
                  busy={busy}
                  conversationId={liveConversationId}
                  onAnswer={(text) => void send(text, [])}
                  onRetry={() => retry(index)}
                  onFeedback={(feedback) => patchMessage(threadKey, m.id, { feedback })}
                  onRegenerate={() => regenerateAnswer(index)}
                  onSelectVersion={selectVersion}
                />
              ),
            )
          )}
        </div>
      </div>

      {/* L'utilisateur a remonté lire et du contenu arrive en bas : on ne le
          tire jamais hors de sa lecture, on lui propose le saut. */}
      {unseenBelow && (
        <div className="pointer-events-none relative -mt-12 flex justify-center pb-1">
          <button
            type="button"
            onClick={() => toBottom()}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-meta font-medium text-ink shadow-float hover:bg-active"
          >
            <ChevronIcon size={14} />
            {dict.chat.jumpToLatest}
          </button>
        </div>
      )}

      {!loadError && voiceOn && <VoiceBar labels={dict.voice} voice={voice} />}
      {/* Le composer reste monté (masqué) pendant le mode vocal : un brouillon en cours n'est pas perdu.
          Sur l'accueil générique, c'est la variante "home" ci-dessus (dans le fil) qui tient ce rôle. */}
      {!loadError && !homeScreen && (
        <div hidden={voiceOn}>
          <Composer
            lang={lang}
            dict={dict}
            busy={busy || editingId !== null}
            conversationId={thread?.conversationId ?? conversationId}
            onSend={send}
            onStop={() => stop(threadKey)}
            onComposingChange={setComposing}
            autoFocus={empty}
            agent={agentProjectId ? { projectId: agentProjectId, value: selectedAgentId, onChange: setPickedAgent } : undefined}
            onStartVoice={() => void voice.start()}
          />
        </div>
      )}
    </div>
    </CanvasHost>
  );
}

/* ── Accueil d'une nouvelle conversation ─────────────────────────────────────────── */

function EmptyState({
  dict,
  firstName,
  listening,
  suggestions,
  onPick,
}: {
  dict: WorkspaceDict;
  firstName: string | null;
  listening: boolean;
  /** Phrases de départ : celles de l'agent choisi, sinon les suggestions générales. */
  suggestions: readonly string[];
  onPick: (text: string) => void;
}) {
  return (
    <div className="mt-[10vh] flex flex-col items-center text-center">
      <DonnaOrb state={listening ? "listening" : "idle"} size={76} />
      <h1 className="mt-6 font-brand text-greeting font-light text-brand-strong">
        {firstName ? `${dict.chat.greeting} ${firstName},` : `${dict.chat.greeting},`}
      </h1>
      <p className="mt-1 text-panel-title text-ink-2">{dict.chat.prompt}</p>
      <ul className="mt-10 flex w-full max-w-[34rem] flex-col gap-2">
        {suggestions.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              onClick={() => onPick(suggestion)}
              className="w-full rounded-card border border-border bg-surface px-4 py-3 text-left text-label text-ink-2 transition-[border-color,color] duration-(--duration-fast) hover:border-brand/30 hover:text-ink"
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

function UserMessage({
  lang,
  message,
  initials,
  label,
  chat,
  conversationId,
  editing,
  canEdit,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onSelectVersion,
}: {
  lang: Locale;
  message: ChatMessage;
  initials: string;
  label: string;
  chat: WorkspaceDict["chat"];
  /** Pour l'aperçu d'un lien tapé par l'utilisateur (voir LinkCard) ; null tant que le backend
   * n'a pas encore créé la conversation (tout premier message) — l'aperçu reste alors désactivé. */
  conversationId: string | null;
  /** Ce message est celui en cours d'édition (formulaire affiché à la place du texte). */
  editing: boolean;
  /** Crayon affiché : persisté, sans pièce jointe, rien d'autre en cours d'édition ou d'envoi. */
  canEdit: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
  onSelectVersion: (messageId: string) => Promise<boolean>;
}) {
  const chip = "inline-flex items-center gap-1.5 rounded-badge bg-surface px-2 py-1 text-meta text-ink-2";
  const hasFiles = Boolean(message.localFiles?.length || message.attachments.length);
  const files = useMemo(() => message.attachments.map((file) => ({ name: file.original_name, url: fileHref(file.file_url) })), [message.attachments]);
  // Pièces jointes image : aperçu dans la bulle (un clic ouvre le visualiseur), sauf si le texte les
  // affiche déjà — même règle et même composant que dans la réponse de DONNA.
  const images = useMemo(() => {
    const inline = inlineImageNames(message.content, files);
    return message.attachments.filter((file) => file.mime_type.startsWith("image/") && isImageName(file.original_name) && !inline.has(file.original_name.normalize("NFC").toLowerCase().trim()));
  }, [files, message.attachments, message.content]);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  // Le message entier n'est qu'une URL (le cas « je colle un lien ») : une carte plutôt qu'un
  // texte brut non cliquable — même carte que celle de DONNA (link-card.tsx), avec aperçu.
  const bareUrl = !hasFiles ? linkCardData(message.content.trim()) : null;
  return (
    <div className="msg-enter flex justify-end gap-3">
      <div className="flex max-w-[85%] flex-col items-end gap-1.5">
        {editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSaveEdit(draftRef.current?.value ?? "");
            }}
            className="flex w-full flex-col gap-2 rounded-panel rounded-tr-badge border border-border bg-surface p-3"
          >
            <textarea
              ref={draftRef}
              defaultValue={message.content}
              autoFocus
              rows={3}
              className="w-full resize-none rounded-button border border-border bg-surface px-3 py-2 text-message text-ink outline-none focus:border-brand"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCancelEdit} className="rounded-button px-3 py-1.5 text-label text-ink-2 hover:bg-active">
                {chat.editCancel}
              </button>
              <button type="submit" className="rounded-button bg-brand-fill px-3 py-1.5 text-label font-medium text-white hover:bg-brand-fill-strong">
                {chat.editSave}
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-panel rounded-tr-badge bg-active px-4 py-3">
            <p className="sr-only">{label} :</p>
            {bareUrl ? (
              <LinkCard
                data={bareUrl}
                className="my-0"
                preview={Boolean(conversationId)}
                conversationId={conversationId ?? undefined}
                labels={chat}
              />
            ) : (
              message.content && (
                <Markdown files={files} renderFile={renderFile} conversationId={conversationId} breaks>
                  {message.content}
                </Markdown>
              )
            )}
            {images.length > 0 && (
              <ul className={`flex flex-wrap gap-1.5 ${message.content ? "mt-2" : ""}`}>
                {images.map((file) => (
                  <li key={file.id}>
                    <FileLink url={fileHref(file.file_url)} name={file.original_name} className="block no-underline">
                      {/* eslint-disable-next-line @next/next/no-img-element -- fichier du message servi par la passerelle, taille inconnue */}
                      <img src={fileHref(file.file_url)} alt={file.original_name} loading="lazy" className="max-h-64 max-w-full rounded-card border border-border" />
                    </FileLink>
                  </li>
                ))}
              </ul>
            )}
            {hasFiles && (
              <ul className={`flex flex-wrap gap-1.5 ${message.content || images.length ? "mt-2" : ""}`}>
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
        )}
        <div className="flex items-center gap-1">
          <Time lang={lang} at={message.createdAt} />
          {!editing && canEdit && (
            <button
              type="button"
              aria-label={chat.edit}
              title={chat.edit}
              onClick={onStartEdit}
              className="flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-active hover:text-ink"
            >
              <PencilIcon size={13} />
            </button>
          )}
          {!editing && (message.siblingIds?.length ?? 0) > 1 && (
            <VersionNav siblingIds={message.siblingIds!} siblingIndex={message.siblingIndex ?? 0} onSelect={onSelectVersion} labels={chat} />
          )}
        </div>
      </div>
      <span aria-hidden className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-peche-100 text-meta font-medium text-brand-strong">
        {initials}
      </span>
    </div>
  );
}

/** Lien du texte vers un fichier joint à CE message : aperçu dans DONNA (voir `Markdown`). */
const renderFile = (file: MarkdownFile, label: ReactNode, variant: "link" | "image") => (
  <FileLink url={file.url} name={file.name} className={variant === "image" ? "inline-block no-underline" : "underline decoration-rose-300 underline-offset-2"}>
    {label}
  </FileLink>
);

function AssistantMessage({
  lang,
  dict,
  message,
  last,
  busy,
  conversationId,
  onAnswer,
  onRetry,
  onFeedback,
  onRegenerate,
  onSelectVersion,
}: {
  lang: Locale;
  dict: WorkspaceDict;
  message: ChatMessage;
  last: boolean;
  busy: boolean;
  /** Pour l'aperçu d'un lien cité par DONNA (voir Markdown/LinkCard). */
  conversationId: string | null;
  onAnswer: (text: string) => void;
  onRetry: () => void;
  onFeedback: (feedback: "up" | "down" | null) => void;
  onRegenerate: () => Promise<boolean>;
  onSelectVersion: (messageId: string) => Promise<boolean>;
}) {
  const { chat } = dict;
  const streaming = message.status === "streaming";
  const tools = message.tools ?? [];
  const question = tools.findLast((t) => t.name === "ask_user");
  const proposals = tools.filter((t) => PROPOSALS.has(t.name));
  const files = useMemo(() => message.attachments.map((file) => ({ name: file.original_name, url: fileHref(file.file_url) })), [message.attachments]);
  // Images produites (graphique, schéma…) : montrées en ligne (sauf si le texte les affiche déjà), en plus de leur carte
  // « Fichiers ». SVG exclu (scripts possibles).
  const images = useMemo(() => {
    const inline = inlineImageNames(message.content, files);
    return message.attachments.filter((file) => file.mime_type.startsWith("image/") && isImageName(file.original_name) && !inline.has(file.original_name.normalize("NFC").toLowerCase().trim()));
  }, [files, message.attachments, message.content]);

  return (
    <div className="msg-enter flex gap-3">
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
            <Markdown files={files} renderFile={renderFile} streaming={streaming} conversationId={conversationId} reading>
              {message.content}
            </Markdown>
            {streaming && <span aria-hidden className="demo-caret ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-brand-fill" />}
          </div>
        ) : null}

        {proposals.map((call) => (
          <ActionCard key={call.result} lang={lang} dict={dict} call={call} />
        ))}

        {question && (
          <QuestionCard dict={dict} call={question} disabled={busy || !last} onAnswer={onAnswer} />
        )}

        {images.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {images.map((file) => (
              <li key={file.id}>
                <FileLink url={fileHref(file.file_url)} name={file.original_name} className="block no-underline">
                  {/* eslint-disable-next-line @next/next/no-img-element -- fichier du message servi par la passerelle, taille inconnue */}
                  <img src={fileHref(file.file_url)} alt={file.original_name} loading="lazy" className="max-h-96 max-w-full rounded-card border border-border" />
                </FileLink>
              </li>
            ))}
          </ul>
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
                    className="inline-flex items-center gap-2 rounded-button border border-border bg-surface px-3 py-2 text-label text-ink no-underline hover:border-brand/30 hover:text-ink"
                  >
                    <FileIcon size={16} className="text-brand" />
                    {file.original_name}
                  </FileLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Sources dict={dict} sources={message.sources} />

        {message.memory && message.memory.length > 0 && (
          <p className="inline-flex items-start gap-1.5 text-secondary text-ink-2">
            <CheckIcon size={15} className="mt-px shrink-0 text-success" />
            <span>
              {chat.memory} : {message.memory.length} faits enregistrés · {message.memory.join(" · ")}
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
                    : (message.errorDetail ?? chat.errorGeneric)}
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

        {!streaming && (
          <div className="flex flex-wrap items-center gap-2">
            <Time lang={lang} at={message.createdAt} />
            {message.content && <ListenButton text={message.content} chat={chat} />}
            {message.status !== "error" && message.serverId && message.content && (
              <FeedbackBar messageId={message.serverId} value={message.feedback} labels={chat} onChange={onFeedback} />
            )}
            {/* Seulement sur la DERNIÈRE réponse : régénérer une réponse plus ancienne abandonnerait tout ce qui la suit. */}
            {last && message.status !== "error" && message.serverId && !busy && (
              <RegenerateButton onRegenerate={onRegenerate} label={chat.regenerate} errorLabel={chat.regenerateError} />
            )}
            {(message.siblingIds?.length ?? 0) > 1 && (
              <VersionNav siblingIds={message.siblingIds!} siblingIndex={message.siblingIndex ?? 0} onSelect={onSelectVersion} labels={chat} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Bouton "écouter" — POST /app/chat/speech (Piper, voix du profil résolue
 * côté serveur). Ne rejoue rien automatiquement : uniquement à la demande,
 * un clic à la fois (voir synthesize_speech, chat_routes.py). */
function ListenButton({ text, chat }: { text: string; chat: WorkspaceDict["chat"] }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  // Annule une réponse /speech encore en vol : sans ça, cliquer "annuler"
  // pendant le chargement n'empêchait pas la lecture de démarrer quand même
  // une fois la réponse arrivée (l'état passait à idle, mais rien n'ignorait
  // le fetch déjà lancé).
  const controllerRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const toggle = useCallback(async () => {
    if (state === "playing" || state === "loading") {
      cleanup();
      setState("idle");
      return;
    }
    setState("loading");
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetch("/api/donna/chat/speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("speech");
      const url = URL.createObjectURL(await response.blob());
      if (controller.signal.aborted) {
        URL.revokeObjectURL(url);
        return;
      }
      urlRef.current = url;
      const audio = new Audio(url);
      audio.onended = () => setState("idle");
      audio.onerror = () => setState("error");
      audioRef.current = audio;
      await audio.play();
      setState("playing");
    } catch {
      if (controller.signal.aborted) return;
      cleanup();
      setState("error");
    }
  }, [cleanup, state, text]);

  const playing = state === "playing" || state === "loading";
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-label={playing ? chat.stopListening : chat.listen}
      title={state === "error" ? chat.listenError : playing ? chat.stopListening : chat.listen}
      className={`flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-active hover:text-ink ${
        state === "error" ? "text-danger" : ""
      }`}
    >
      {playing ? <StopIcon size={13} /> : <SpeakerIcon size={14} />}
    </button>
  );
}

/** État de l'orbe pendant une réponse : elle réfléchit, agit (outil en cours), puis répond. */
// Fenêtre où l'orbe fraîchement créée montre encore "listening" (comme l'accueil pendant la
// frappe) avant de basculer sur "thinking" — sans ça, le passage accueil → première réponse
// saute d'un coup d'un orbe à l'autre, sans continuité visible entre les deux (voir fondations/
// États : idle → listening → thinking → working → answering est une suite, pas un saut).
const LISTENING_GRACE_MS = 450;

function liveOrbState(message: ChatMessage): OrbState {
  const running = (message.steps ?? []).find((step) => step.status === "running");
  if (running && running.key !== "read" && running.key !== "answer") return "working";
  if (message.content) return "answering";
  if (running?.key === "read" && message.createdAt && Date.now() - message.createdAt < LISTENING_GRACE_MS) return "listening";
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
          {steps.map((step) => {
            const detail = stepDetail(dict, step);
            return (
              <li key={step.id} className="flex items-start gap-2.5 text-secondary">
                <span className="mt-0.5 flex">
                  <StepDot status={step.status} warn={detail?.warn} />
                </span>
                <span className={`flex-1 ${step.status === "done" ? "text-ink-2" : "text-ink"}`}>
                  {stepLabel(dict, step.key)}
                  {detail && <span className={`block text-meta text-pretty ${detail.warn ? "text-danger" : "text-ink-3"}`}>{detail.text}</span>}
                </span>
                <Time lang={lang} at={step.at} />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Brouillon proposé par DONNA (email ou agenda) : rien ne part sans validation. */
function ActionCard({ lang, dict, call }: { lang: Locale; dict: WorkspaceDict; call: ToolCall }) {
  const { pending, decisions, decideAction, selectBranch, activeKey, threads } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fetched, setFetched] = useState<PendingActionOut | null>(null);
  const id = actionIdFrom(call.result);

  // Brouillon RÉEL côté serveur (pièces jointes comprises) : ce que le modèle a demandé a pu être refusé,
  // résolu ou renommé — seul le serveur sait ce qui partira. Valable quel que soit le statut de l'action.
  // Lu pour TOUTE proposition : c'est aussi lui qui dit qu'un brouillon a été « remplacé » (sa branche n'est plus
  // celle qui est affichée — voir branches.py) et ne peut donc plus être approuvé.
  useEffect(() => {
    if (!id) return;
    let live = true;
    void (async () => {
      try {
        const response = await fetch(`/api/donna/chat/memory/actions/${encodeURIComponent(id)}`, { cache: "no-store" });
        if (response.ok && live) setFetched((await response.json()) as PendingActionOut);
      } catch {
        // Silencieux : la carte reste utilisable sans la liste des pièces jointes.
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);

  if (!id) return null;

  const decision = decisions[id];
  const awaiting = !decision && pending.some((a) => a.id === id);
  const superseded = !decision && !awaiting && fetched?.status === "superseded";
  const listed = pending.find((a) => a.id === id);
  const draft = listed?.email ?? fetched?.email ?? null;
  const workflow = listed?.workflow ?? fetched?.workflow ?? null;
  const args = call.arguments;
  const isEmail = call.name === "propose_email";
  const isDriveUpload = call.name === "propose_drive_upload";
  const isWorkflow = call.name === "propose_workflow";
  const isResearch = call.name === "propose_research";
  const research = listed?.research ?? fetched?.research ?? null;
  // Une recherche approuvée (à l'instant, ou avant un rechargement) se suit ; le rapport rejoint la conversation tout seul.
  const researchStarted = isResearch && (decision === "confirm" || fetched?.status === "executed");

  // Fin de la recherche : si le rapport n'est pas déjà dans le fil, on recharge la branche affichée pour le montrer (avec ses fichiers).
  const showReport = (messageId: string) => {
    const thread = activeKey ? threads[activeKey] : null;
    if (activeKey && thread?.conversationId) void selectBranch(activeKey, thread.conversationId, messageId);
  };
  const reportAlreadyShown = (run: ResearchRun) => {
    const thread = activeKey ? threads[activeKey] : null;
    return !run.report_message_id || Boolean(thread?.messages.some((m) => m.serverId === run.report_message_id));
  };
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
    // Une carte qui attend une décision se voit d'un coup d'œil, et ne se confond
    // pas avec celles déjà tranchées : c'est le seul moment du produit qui exige
    // la personne. Les autres gardent le fond neutre.
    <div className={`rounded-panel border p-4 ${awaiting ? "border-attention/40 bg-attention-soft" : "border-border bg-ivoire-50"}`}>
      <div className="flex items-center justify-between gap-3 text-meta">
        <span className="font-medium text-ink">
          {isEmail ? dict.chat.draftEmail : isDriveUpload ? dict.chat.draftDriveUpload : isWorkflow ? dict.chat.draftWorkflow : isResearch ? dict.chat.draftResearch : dict.chat.draftEvent}
        </span>
        {decision ? (
          <span className={`inline-flex items-center gap-1 ${decision === "confirm" ? "text-success-ink" : "text-ink-3"}`}>
            {decision === "confirm" ? <CheckIcon size={14} /> : <CloseIcon size={14} />}
            {decision === "confirm" ? dict.panel.approved : dict.panel.declined}
          </span>
        ) : superseded ? (
          <span className="inline-flex items-center gap-1 text-ink-3">
            <CloseIcon size={14} />
            {dict.chat.superseded}
          </span>
        ) : (
          awaiting && (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-attention">
              <span className="pending-dot size-1.5 rounded-full bg-attention" />
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
          {draft && <EmailAttachmentList actionId={id} attachments={draft.attachments} openable={awaiting} labels={dict.chat} />}
        </>
      ) : isWorkflow ? (
        <WorkflowDraft draft={workflow ?? { name: text(args.name), lines: [] }} labels={dict.chat} agentLabels={dict.workflowAgents} />
      ) : isResearch ? (
        <>
          <p className="mt-3 text-label font-medium text-ink">{research?.question ?? text(args.question)}</p>
          {research && (
            <>
              <p className="mt-1 text-meta text-ink-3">
                {dict.chat.researchDepth[research.depth as keyof typeof dict.chat.researchDepth] ?? research.depth}
              </p>
              <p className="mt-2 text-secondary text-ink-2 text-pretty">
                {dict.chat.researchEstimateLine
                  .replace("{estimate}", estimateText(research.cost_usd, { unknown: dict.chat.researchUnknown, free: dict.chat.researchFree }, lang))
                  .replace("{cap}", formatUsd(research.cap_usd, lang))}
              </p>
            </>
          )}
          {researchStarted && id && (
            <ResearchProgress
              actionId={id}
              lang={lang}
              labels={dict.chat}
              onFinished={(run) => {
                if (run.status === "done" && !reportAlreadyShown(run) && run.report_message_id) showReport(run.report_message_id);
              }}
              onShowReport={showReport}
            />
          )}
        </>
      ) : isDriveUpload ? (
        <>
          <p className="mt-3 text-label font-medium text-ink">{text(args.filename)}</p>
          {text(args.mime_type) && <p className="mt-0.5 text-meta text-ink-3">{text(args.mime_type)}</p>}
          {text(args.content) && (
            <p className="mt-2 line-clamp-6 text-secondary leading-5 whitespace-pre-wrap text-ink-2">{text(args.content)}</p>
          )}
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
            className="rounded-button bg-brand-fill px-3.5 py-2 text-label font-medium text-white hover:bg-brand-fill-strong disabled:opacity-60"
          >
            {isResearch ? dict.chat.researchStart : dict.panel.approve}
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
    <div className="rounded-panel border border-rose-300/60 bg-surface p-4">
      <p className="text-meta text-brand">{dict.chat.questionLabel}</p>
      <p className="mt-1 text-message text-ink">{text(call.arguments.question)}</p>
      {options.length > 0 && (
        <div role="group" aria-label={dict.chat.optionsLabel} className="mt-3 flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onAnswer(option)}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-label text-ink hover:border-brand/40 hover:bg-surface disabled:opacity-50"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Une carte par extrait réellement injecté (même document plusieurs fois = plusieurs
 * extraits = plusieurs cartes, voir lib/sources.ts) ; un fichier PRODUIT par DONNA n'est pas
 * une source, il est dans « Fichiers ». Rangée défilante plutôt qu'un dépliant : le nom ET l'extrait se voient
 * d'un coup d'œil, sans clic supplémentaire. La barre de défilement étant masquée, deux
 * boutons apparaissent là où il reste des cartes hors de vue (sinon une carte coupée au
 * bord ne dit pas qu'on peut aller plus loin). */
function Sources({ dict, sources }: { dict: WorkspaceDict; sources: SourceOut[] | undefined }) {
  const cards = visibleSources(sources);
  const listRef = useRef<HTMLUListElement>(null);
  const [hidden, setHidden] = useState({ before: false, after: false });

  // Mesuré à chaque défilement et à chaque changement de taille — jamais directement dans l'effet : le premier appel vient
  // du ResizeObserver, qui notifie dès qu'il observe l'élément.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () =>
      setHidden({
        before: list.scrollLeft > 4,
        after: list.scrollLeft + list.clientWidth < list.scrollWidth - 4,
      });
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    list.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", measure);
    };
  }, [cards.length]);

  const scroll = (direction: 1 | -1) => {
    const list = listRef.current;
    list?.scrollBy({ left: direction * list.clientWidth * 0.8, behavior: "smooth" });
  };
  if (cards.length === 0) return null;
  const arrow = "absolute top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-ink-2 shadow-float hover:bg-active";

  return (
    <div>
      <p className="text-meta text-ink-3">{dict.chat.sources}</p>
      <div className="relative mt-1.5">
        {hidden.before && (
          <button type="button" aria-label={dict.chat.sourcesPrev} onClick={() => scroll(-1)} className={`${arrow} left-1`}>
            <ChevronIcon size={14} className="rotate-90" />
          </button>
        )}
        <ul ref={listRef} className="scrollbar-none flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
          {cards.map((source, index) => {
            const excerpt = readableExcerpt(source.excerpt);
            return (
              <li key={`${source.doc_id}-${index}`} className="shrink-0 snap-start">
                <FileLink
                  url={fileHref(source.file_url)}
                  name={source.original_name}
                  className="flex h-full w-60 flex-col gap-1.5 rounded-card border border-border bg-surface p-3 no-underline transition-colors hover:border-brand/30 hover:bg-active/40"
                >
                  <span className="flex items-start gap-1.5 text-label font-medium text-ink" title={source.original_name}>
                    <FileIcon size={14} className="mt-0.5 shrink-0 text-brand" />
                    <span className="line-clamp-2 [overflow-wrap:anywhere]">{source.original_name}</span>
                  </span>
                  {excerpt && <span className="line-clamp-3 text-meta text-ink-3 [overflow-wrap:anywhere]">{excerpt}</span>}
                </FileLink>
              </li>
            );
          })}
        </ul>
        {hidden.after && (
          <button type="button" aria-label={dict.chat.sourcesNext} onClick={() => scroll(1)} className={`${arrow} right-1`}>
            <ChevronIcon size={14} className="-rotate-90" />
          </button>
        )}
      </div>
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
  | { type: "compact" }
  | { type: "shortcut"; kind: MentionKind };
type MenuItem = { id: string; label: string; /** Projet d'un document (affiché en discret). */ hint?: string; kind: "project" | "document" | "command"; action: MenuAction };

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
  lang,
  dict,
  busy,
  conversationId,
  onSend,
  onStop,
  onComposingChange,
  autoFocus,
  agent,
  onStartVoice,
  variant = "default",
}: {
  lang: Locale;
  dict: WorkspaceDict;
  busy: boolean;
  /** Conversation en cours (null sur l'accueil) : la jauge de contexte et /compact n'existent qu'avec elle. */
  conversationId: string | null;
  onSend: (text: string, files: File[], webSearch: boolean, mentions: MentionSelection) => Promise<void>;
  onStop: () => void;
  onComposingChange?: (composing: boolean) => void;
  autoFocus: boolean;
  /** Agents du projet : présent seulement dans un projet. `value` : l'agent choisi (null = DONNA seule). */
  agent?: { projectId: string; value: string | null; onChange: (id: string | null) => void };
  /** Lance le mode vocal (absent : pas de bouton, p. ex. le composer de la page projet). */
  onStartVoice?: () => void;
  /** "home" : bandeau resserré + raccourcis de l'accueil générique, à la place de la barre complète. */
  variant?: "default" | "home";
}) {
  const home = variant === "home";
  const { projects } = useWorkspace();
  const { agents: projectAgents } = useProjectAgents(agent?.projectId);
  // Relecture des consignes avant le premier emploi d'un agent (ou d'une nouvelle version de celui-ci).
  // `send` : la relecture a interrompu un envoi (et non un simple choix dans le menu) — confirmée, le message part tout seul.
  const [review, setReview] = useState<{ agent: AgentOut; changed: boolean; send: boolean } | null>(null);
  const askReview = (candidate: AgentOut, send = false): boolean => {
    const seen = readSeen();
    if (!needsReview(candidate, seen)) return false;
    setReview({ agent: candidate, changed: seen[candidate.id] !== undefined, send });
    return true;
  };
  const context = useConversationContext(conversationId, busy);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  // Pièces jointes : message d'information (plafond atteint, fichiers Drive en échec) et
  // récupération Drive en cours — jamais d'abandon silencieux d'un fichier.
  const [notice, setNotice] = useState<string | null>(null);
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveFetch, setDriveFetch] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
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
  const [accessibleDocs, setAccessibleDocs] = useState<AccessibleDocumentOut[] | null>(null);
  const docsFetchedRef = useRef(false);

  const ensurePersonalDocs = useCallback(() => {
    if (docsFetchedRef.current) return;
    docsFetchedRef.current = true;
    void (async () => {
      try {
        // Documents personnels ET ceux des projets dont l'utilisateur est membre.
        const response = await fetch("/api/donna/chat/documents", { cache: "no-store" });
        if (response.ok) setAccessibleDocs((await response.json()) as AccessibleDocumentOut[]);
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

  // Raccourcis de l'accueil générique (variant "home") : amorcent une vraie saisie plutôt que
  // de l'envoyer à la place de l'utilisateur, qui relit et complète avant d'envoyer lui-même.
  const prefill = useCallback(
    (text: string) => {
      setValue(text);
      onComposingChange?.(true);
      focusAt(text.length);
    },
    [focusAt, onComposingChange],
  );

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
        ...(conversationId ? [{ id: "compact", label: dict.chat.cmdCompact, kind: "command" as const, action: { type: "compact" as const } }] : []),
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
      for (const d of accessibleDocs ?? []) {
        // Seuls les documents indexés ont un contenu à injecter (un échec ou une attente n'en ont pas).
        if (d.status !== "done" || (q && !d.original_name.toLowerCase().includes(q))) continue;
        const mention: Mention = { id: d.id, label: `@${d.original_name}`, kind: "document", projectId: d.project_id };
        items.push({ id: `document:${d.id}`, label: mention.label, hint: d.project_name ?? d.conversation_title ?? undefined, kind: "document", action: { type: "mention", mention } });
      }
    }
    return items.slice(0, 8);
  }, [menu, projects, accessibleDocs, dict.chat, conversationId]);

  // Compaction à la demande (bouton de la jauge ou /compact) : renvoie le message à afficher.
  const runCompact = useCallback(async (): Promise<string> => {
    const outcome = await context.compact();
    return outcome === "compacted" ? dict.chat.contextDone : outcome === "nothing" ? dict.chat.contextNothing : dict.chat.contextError;
  }, [context, dict.chat]);

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
        case "compact":
          insertToken("");
          void runCompact().then(setNotice);
          break;
        case "shortcut":
          runSlashShortcut(item.action.kind);
          break;
      }
    },
    [selectMention, insertToken, runSlashShortcut, runCompact],
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
    if (!blob.size) {
      onComposingChange?.(value.trim().length > 0);
      return;
    }
    setTranscribing(true);
    let gotText = false;
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      const response = await fetch("/api/donna/chat/transcribe", { method: "POST", body: form });
      if (!response.ok) throw new Error();
      const { text } = (await response.json()) as { text: string };
      if (text) {
        gotText = true;
        setValue((current) => (current.trim() ? `${current.trim()} ${text}` : text));
      }
    } catch {
      setMicError("transcribe");
    } finally {
      setTranscribing(false);
      // `value` est celui d'AVANT cet enregistrement (fermeture figée au clic sur le micro) :
      // combiné à `gotText`, ça couvre les trois cas (texte déjà présent, texte transcrit,
      // ni l'un ni l'autre) sans relire le DOM (React n'a pas encore ré-affiché `value`).
      onComposingChange?.(gotText || value.trim().length > 0);
    }
  }, [onComposingChange, value]);

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
      // DONNA « écoute » pendant l'enregistrement, pas seulement pendant la frappe — même
      // orbe "listening" que pour du texte (voir EmptyState, conversation.tsx::composing).
      onComposingChange?.(true);
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

  const addFiles = (picked: File[]) => {
    if (!picked.length) return;
    const room = Math.max(MAX_FILES - files.length, 0);
    const accepted = picked.slice(0, room);
    setFiles((list) => [...list, ...accepted]);
    const skipped = picked.length - accepted.length;
    setNotice(skipped > 0 ? dict.chat.filesLimit.replace("{max}", String(MAX_FILES)).replace("{n}", String(skipped)) : null);
  };

  const attachFromDrive = async (picked: DriveFileOut[]) => {
    setNotice(null);
    setDriveFetch({ done: 0, total: picked.length });
    const result = await downloadDriveFiles(picked, (done, total) => setDriveFetch({ done, total }));
    setDriveFetch(null);
    addFiles(result.files);
    if (result.failed.length) {
      const reasons = dict.drive.errors as Record<string, string>;
      const detail = result.failed.map((f) => `${f.name} (${reasons[f.code] ?? reasons.unavailable})`).join(", ");
      setNotice(dict.chat.driveFailed.replace("{files}", detail));
    }
  };

  const submit = () => {
    if (busy || driveFetch || (!value.trim() && !files.length)) return;
    // Un agent jamais relu (lien « Essayer », consignes modifiées depuis) : on les montre d'abord ; le message reste là.
    const chosen = projectAgents?.find((a) => a.id === agent?.value);
    if (chosen && askReview(chosen, true)) return;
    const [text, attached] = [value, files];
    const activeMentions = mentions.filter((m) => text.includes(m.label));
    // Un document de projet mentionné sans son projet : le tour est cadré sur ce projet — le
    // backend n'accorde un document de projet que dans le périmètre effectif du tour.
    const documentMentions = activeMentions.filter((m) => m.kind === "document");
    const selection: MentionSelection = {
      documentIds: documentMentions.map((m) => m.id),
      projectId:
        activeMentions.find((m) => m.kind === "project")?.id ?? documentMentions.find((m) => m.projectId)?.projectId ?? null,
    };
    setValue("");
    setFiles([]);
    setNotice(null);
    setMentions([]);
    setMenu(null);
    onComposingChange?.(false);
    void onSend(text, attached, webSearch, selection);
  };

  const canSend = !busy && !driveFetch && (value.trim().length > 0 || files.length > 0);

  // Un agent jamais relu : ses consignes passent d'abord sous les yeux (la voix n'a pas d'écran pour le faire) ; puis on relance.
  const startVoice = () => {
    const chosen = projectAgents?.find((a) => a.id === agent?.value);
    if (chosen && askReview(chosen)) return;
    onStartVoice?.();
  };

  // Rechercher sur le Web, à l'accueil : contrairement aux deux autres raccourcis, c'est un vrai bascule
  // existant (même état que le globe de la barre complète), pas une amorce de texte.
  const activateWebSearch = useCallback(() => {
    setWebSearch(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const driveButton = (
    <button
      type="button"
      disabled={busy || Boolean(driveFetch) || files.length >= MAX_FILES}
      onClick={() => setDriveOpen(true)}
      aria-label={dict.chat.attachDrive}
      title={dict.chat.attachDrive}
      className="flex size-9 items-center justify-center rounded-button text-ink-2 hover:bg-active hover:text-ink disabled:opacity-50"
    >
      <GoogleDriveIcon size={18} />
    </button>
  );
  const micButton = (
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
  );
  // Sur l'accueil, le bouton de mode vocal reprend l'orbe de marque (même composant que le fil et la barre vocale)
  // plutôt que l'icône plate de la barre complète — c'est la place exacte de l'avatar rond de la maquette.
  const voiceButton = !onStartVoice ? null : home ? (
    <button
      type="button"
      onClick={startVoice}
      disabled={busy || recording || transcribing}
      aria-label={dict.voice.start}
      title={`${dict.voice.start} — ${dict.voice.startHint}`}
      className="flex size-10 items-center justify-center rounded-full transition-transform duration-(--duration-fast) hover:scale-105 disabled:opacity-50"
    >
      <DonnaOrb state="idle" size={36} />
    </button>
  ) : (
    <VoiceStartButton labels={dict.voice} onStart={startVoice} disabled={busy || recording || transcribing} />
  );
  const sendButton = busy ? (
    <button
      type="button"
      onClick={onStop}
      aria-label={dict.chat.stop}
      title={dict.chat.stop}
      className="flex size-9 items-center justify-center rounded-button bg-ink text-white hover:bg-brand-fill-strong"
    >
      <StopIcon size={16} />
    </button>
  ) : (
    <button
      type="submit"
      disabled={!canSend}
      aria-label={dict.chat.send}
      title={dict.chat.send}
      className="flex size-9 items-center justify-center rounded-button bg-brand-fill text-white transition-colors hover:bg-brand-fill-strong disabled:bg-pending disabled:text-ink-3"
    >
      <SendIcon size={18} />
    </button>
  );

  return (
    <div className={home ? "" : "px-4 pb-4 md:px-8"}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onDragOver={(event) => {
          if (busy || !event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(event) => {
          if (busy || !event.dataTransfer.files.length) return;
          event.preventDefault();
          setDragging(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
        className={`relative mx-auto w-full rounded-panel border bg-surface shadow-float focus-within:border-brand/40 ${home ? "msg-enter max-w-[34rem]" : "max-w-[46rem]"} ${dragging ? "border-brand shadow-focus" : "border-border"}`}
      >
        {dragging && (
          <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-panel bg-surface/85 text-label font-medium text-brand">
            {dict.chat.dropFiles}
          </p>
        )}
        {menu && (
          <ul
            role="listbox"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleMenuListClick}
            className="scrollbar-none absolute bottom-full left-0 right-0 z-10 mb-2 max-h-64 overflow-y-auto rounded-panel border border-border bg-surface p-1.5 shadow-float"
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
                  {item.kind === "project" && <FolderIcon size={16} className="shrink-0 text-brand" />}
                  {item.kind === "document" && <FileIcon size={16} className="shrink-0 text-ink-3" />}
                  <span className="truncate">{item.label}</span>
                  {item.hint && <span className="ml-auto shrink-0 pl-2 text-meta text-ink-3">{item.hint}</span>}
                </li>
              ))
            ) : (
              <li className="px-2.5 py-2 text-label text-ink-3">{dict.chat.mentionNoResults}</li>
            )}
          </ul>
        )}
        {driveFetch && (
          <p role="status" className="px-4 pt-3 text-meta text-ink-2">
            {dict.chat.driveFetching.replace("{done}", String(driveFetch.done)).replace("{total}", String(driveFetch.total))}
          </p>
        )}
        {notice && (
          <p role="status" className="px-4 pt-3 text-meta text-brand">
            {notice}
          </p>
        )}
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-4 pt-3">
            {files.map((file, index) => {
              const remove = (
                <button
                  type="button"
                  aria-label={`${dict.chat.removeFile} ${file.name}`}
                  onClick={() => setFiles((list) => list.filter((_, i) => i !== index))}
                  className="flex size-5 items-center justify-center rounded-badge hover:bg-surface hover:text-ink"
                >
                  <CloseIcon size={12} />
                </button>
              );
              return pendingIsImage(file) ? (
                <li key={`${file.name}-${index}`} className="relative w-24 overflow-hidden rounded-card border border-border bg-active">
                  <PendingThumb file={file} />
                  <span className="block truncate px-1.5 pb-0.5 pt-1 text-meta text-ink-2">{file.name}</span>
                  <span className="absolute right-1 top-1 bg-surface/90">{remove}</span>
                </li>
              ) : (
                <li key={`${file.name}-${index}`} className="inline-flex items-center gap-1.5 rounded-badge bg-active py-1 pr-1 pl-2 text-meta text-ink-2">
                  <FileIcon size={14} />
                  <span className="max-w-[12rem] truncate">{file.name}</span>
                  {remove}
                </li>
              );
            })}
          </ul>
        )}
        <label htmlFor="composer" className="sr-only">
          {home ? dict.chat.homePlaceholder : dict.chat.placeholder}
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
            onComposingChange?.(event.target.value.trim().length > 0 || recording || transcribing);
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
          placeholder={home ? dict.chat.homePlaceholder : dict.chat.placeholder}
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
                addFiles(Array.from(event.target.files ?? []));
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
              {home ? <PlusIcon size={19} /> : <PaperclipIcon size={19} />}
            </button>
            {home ? (
              // Analyser : amorce la même saisie qu'un raccourci, vers la skill "Tableaux, images et PDF scannés".
              <button
                type="button"
                disabled={busy}
                onClick={() => prefill(dict.chat.homeAnalyzePrefill)}
                aria-label={dict.chat.homeAnalyze}
                title={dict.chat.homeAnalyze}
                className="inline-flex h-9 items-center gap-1.5 rounded-button px-2.5 text-label text-ink-2 transition-colors hover:bg-active hover:text-ink disabled:opacity-50"
              >
                <Sparkles size={18} aria-hidden />
                {dict.chat.homeAnalyze}
              </button>
            ) : (
              <>
                {driveButton}
                {micButton}
                {voiceButton}
                <button
                  type="button"
                  onClick={() => setWebSearch((v) => !v)}
                  aria-pressed={webSearch}
                  title={webSearch ? dict.chat.webSearchOn : dict.chat.webSearchOff}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-button px-2.5 text-label transition-colors ${
                    webSearch ? "bg-brand/10 font-medium text-brand" : "text-ink-2 hover:bg-active hover:text-ink"
                  }`}
                >
                  <GlobeIcon size={18} />
                  <span className={webSearch ? "" : "sr-only"}>{dict.chat.webSearch}</span>
                </button>
                <ModelMenu lang={lang} labels={dict.chat.models} />
                <SkillsMenu lang={lang} labels={dict.chat} />
                {agent && (Boolean(agent.value) || (projectAgents?.length ?? 0) > 0) && (
                  <AgentMenu
                    lang={lang}
                    labels={dict.agents}
                    projectId={agent.projectId}
                    agents={projectAgents ?? []}
                    value={agent.value}
                    onPick={(picked) => {
                      if (picked && askReview(picked)) return;
                      agent.onChange(picked?.id ?? null);
                    }}
                  />
                )}
                {conversationId && (
                  <ContextMenu labels={dict.chat} status={context.status} compacting={context.compacting} busy={busy} onCompact={runCompact} />
                )}
              </>
            )}
          </div>
          {home ? (
            <div className="flex items-center gap-1">
              {driveButton}
              {micButton}
              {voiceButton}
              {sendButton}
            </div>
          ) : (
            sendButton
          )}
        </div>
      </form>
      {home && (
        <ul className="msg-enter mx-auto mt-3 flex w-full max-w-[34rem] flex-col gap-1" style={{ animationDelay: "90ms" }}>
          <li>
            <button
              type="button"
              onClick={() => prefill(dict.chat.homeImagePrefill)}
              className="flex w-full items-center gap-2.5 rounded-card px-3 py-2.5 text-left text-label text-ink-2 transition-colors hover:bg-active hover:text-ink"
            >
              <ImageIcon size={18} aria-hidden className="text-brand" />
              {dict.chat.homeImage}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => prefill(dict.chat.homeWritePrefill)}
              className="flex w-full items-center gap-2.5 rounded-card px-3 py-2.5 text-left text-label text-ink-2 transition-colors hover:bg-active hover:text-ink"
            >
              <PencilIcon size={18} className="text-brand" />
              {dict.chat.homeWrite}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={activateWebSearch}
              className="flex w-full items-center gap-2.5 rounded-card px-3 py-2.5 text-left text-label text-ink-2 transition-colors hover:bg-active hover:text-ink"
            >
              <GlobeIcon size={18} className="text-brand" />
              {dict.chat.homeWebSearch}
            </button>
          </li>
        </ul>
      )}
      {/* Hors du <form> : Entrée dans la recherche du sélecteur ne doit jamais envoyer le message. */}
      <DrivePicker
        lang={lang}
        labels={dict.drive}
        open={driveOpen}
        onClose={() => setDriveOpen(false)}
        max={Math.max(MAX_FILES - files.length, 1)}
        confirmLabel="attach"
        onConfirm={attachFromDrive}
      />

      <AgentReviewDialog
        lang={lang}
        labels={dict.agents}
        agent={review?.agent ?? null}
        changed={review?.changed ?? false}
        onCancel={() => setReview(null)}
        onConfirm={(confirmed) => {
          const resend = review?.send ?? false;
          markSeen(confirmed);
          agent?.onChange(confirmed.id);
          setReview(null);
          if (resend) queueMicrotask(submit); // l'agent était déjà choisi : les consignes sont maintenant relues, le message part
        }}
      />

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
