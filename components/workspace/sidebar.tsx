"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { DonnaLockup } from "@/components/brand/donna-mark";
import { LanguageSwitch } from "@/components/language-switch";
import { logout } from "@/lib/auth-actions";
import { EXPORT_FORMATS, exportHref } from "@/lib/conversation-export";
import { groupByDate, groupByProject } from "@/lib/sidebar-grouping";
import type { ConversationOut } from "@/lib/workspace-types";
import { ChatIcon, ChevronIcon, CloseIcon, ComposeIcon, FolderIcon, LogoutIcon, MoreIcon, SearchIcon, SettingsIcon } from "./icons";
import { ConversationHoverPreview, type PreviewAnchor, useHoverPreview } from "./conversation-hover-preview";
import { BarChart3, Workflow as WorkflowGlyph } from "lucide-react";
import { ProjectSidebarSection } from "./project-list";
import { useWorkspace } from "./workspace-provider";

type Labels = Dictionary["workspace"]["sidebar"];
export type Account = { name: string; email: string; initials: string; workspace: string | null };

const noopSubscribe = () => () => {};
/** « ⌘K » sur Mac, « Ctrl K » ailleurs (inconnu au rendu serveur). */
const useShortcutLabel = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => "Ctrl K",
  );
/** Vrai après hydratation : le regroupement par date dépend du fuseau du navigateur. */
const useMounted = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

export function Sidebar({
  lang,
  labels,
  projectLabels,
  languageLabel,
  account,
  open,
  onClose,
}: {
  lang: Locale;
  labels: Labels;
  projectLabels: Dictionary["workspace"]["projects"];
  languageLabel: string;
  account: Account;
  open: boolean;
  onClose: () => void;
}) {
  const { conversations, projects } = useWorkspace();
  const { notices } = useWorkspace();
  const unreadCount = Object.keys(notices).length;
  const pathname = usePathname();
  const mounted = useMounted();
  const { setSearchOpen } = useWorkspace();
  const shortcut = useShortcutLabel();
  // « Par date » (défaut) ou « par projet » : la seconde vue rend explicite le
  // rattachement d'une conversation à un projet.
  const [grouping, setGrouping] = useState<"date" | "project">("date");

  const activeId = pathname.match(/\/app\/c\/([^/]+)/)?.[1];
  const activeProjectId = pathname.match(/\/app\/projects\/([^/]+)/)?.[1];
  const workflowsActive = pathname.includes("/app/workflows");
  const usageActive = pathname.includes("/app/usage");

  return (
    <>
      {/* Voile mobile */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-ink/25 transition-opacity duration-(--duration-standard) lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        aria-label={labels.label}
        className={`fixed inset-y-0 left-0 z-40 flex w-[17.5rem] flex-col border-r border-border bg-sidebar transition-transform duration-(--duration-enter) ease-(--ease-enter) lg:static lg:translate-x-0 ${
          open ? "translate-x-0 shadow-float" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-4">
          <Link href={`/${lang}/app`} className="no-underline" onClick={onClose}>
            <DonnaLockup size={30} />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href={`/${lang}/app`}
              onClick={onClose}
              aria-label={labels.newChat}
              title={labels.newChat}
              className="flex size-9 items-center justify-center rounded-button border border-border bg-surface text-ink-2 hover:bg-white hover:text-bordeaux-900"
            >
              <ComposeIcon size={18} />
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label={labels.close}
              className="flex size-9 items-center justify-center rounded-button text-ink-2 hover:text-bordeaux-900 lg:hidden"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        <div className="px-4">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={labels.searchLabel}
            aria-keyshortcuts="Control+K Meta+K"
            className="flex h-10 w-full items-center gap-2.5 rounded-button border border-border bg-surface px-3 text-left text-label text-ink-3 hover:border-ink-3/40 hover:text-ink-2"
          >
            <SearchIcon size={17} />
            <span className="flex-1">{labels.search}</span>
            <kbd className="rounded-badge border border-border bg-white px-1.5 font-sans text-meta text-ink-3" suppressHydrationWarning>
              {shortcut}
            </kbd>
          </button>
        </div>

        <nav aria-label={labels.conversations} className="scrollbar-none mt-5 flex-1 overflow-y-auto px-2 pb-4">
          <Link
            href={`/${lang}/app/workflows`}
            onClick={onClose}
            aria-current={workflowsActive ? "page" : undefined}
            className={`mb-3 flex h-9 items-center gap-2.5 rounded-nav px-2.5 text-label no-underline transition-colors duration-(--duration-fast) ${
              workflowsActive ? "bg-active font-medium text-ink" : "text-ink-2 hover:bg-active/70 hover:text-ink"
            }`}
          >
            <WorkflowGlyph size={16} className="text-ink-3" />
            {labels.workflows}
          </Link>
          <Link
            href={`/${lang}/app/usage`}
            onClick={onClose}
            aria-current={usageActive ? "page" : undefined}
            className={`mb-3 flex h-9 items-center gap-2.5 rounded-nav px-2.5 text-label no-underline transition-colors duration-(--duration-fast) ${
              usageActive ? "bg-active font-medium text-ink" : "text-ink-2 hover:bg-active/70 hover:text-ink"
            }`}
          >
            <BarChart3 size={16} className="text-ink-3" />
            {labels.usage}
          </Link>
          <ProjectSidebarSection
            lang={lang}
            labels={labels}
            projectLabels={projectLabels}
            activeId={activeProjectId}
            onNavigate={onClose}
          />
          <div className="mt-4 flex items-center justify-between gap-2 px-2.5 pb-1.5">
            <p className="flex items-center gap-2 text-caps font-medium text-ink-3 uppercase">
              {labels.conversations}
              {/* Nombre total de fils en attente, toutes conversations. */}
              {unreadCount > 0 && (
                <span className="rounded-badge bg-bordeaux-700 px-1.5 py-px text-[10px] leading-4 font-semibold text-white tabular-nums">
                  {unreadCount}
                  <span className="sr-only">{labels.unread}</span>
                </span>
              )}
            </p>
            <div role="group" aria-label={labels.groupBy} className="flex items-center gap-px rounded-badge bg-active p-px">
              {(["date", "project"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGrouping(mode)}
                  aria-pressed={grouping === mode}
                  className={`rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    grouping === mode ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink-2"
                  }`}
                >
                  {mode === "date" ? labels.byDate : labels.byProject}
                </button>
              ))}
            </div>
          </div>
          {!conversations.length ? (
            <p className="px-2.5 py-2 text-secondary text-ink-3">{labels.empty}</p>
          ) : grouping === "project" ? (
            // Par projet : aucun dépend du fuseau du navigateur, donc pas de
            // garde `mounted` nécessaire — pas d'incohérence à l'hydratation.
            groupByProject(conversations, projects, labels.noProject).map((group) => (
              <div key={group.key} className="mt-2 first:mt-0">
                <p className="px-2.5 pt-2 pb-1 text-meta text-ink-3">{group.label}</p>
                <ConversationList
                  lang={lang}
                  items={group.items}
                  activeId={activeId}
                  labels={labels}
                  projectLabels={projectLabels}
                  onNavigate={onClose}
                />
              </div>
            ))
          ) : mounted ? (
            groupByDate(conversations, labels).map((group) => (
              <div key={group.key} className="mt-2 first:mt-0">
                <p className="px-2.5 pt-2 pb-1 text-meta text-ink-3">{group.label}</p>
                <ConversationList lang={lang} items={group.items} activeId={activeId} labels={labels} projectLabels={projectLabels} onNavigate={onClose} />
              </div>
            ))
          ) : (
            <ConversationList lang={lang} items={conversations} activeId={activeId} labels={labels} projectLabels={projectLabels} onNavigate={onClose} />
          )}
        </nav>

        <AccountMenu lang={lang} labels={labels} languageLabel={languageLabel} account={account} />
      </aside>
    </>
  );
}

function ConversationList({
  lang,
  items,
  activeId,
  labels,
  projectLabels,
  onNavigate,
}: {
  lang: Locale;
  items: ConversationOut[];
  activeId?: string;
  labels: Labels;
  projectLabels: Dictionary["workspace"]["projects"];
  onNavigate: () => void;
}) {
  const [previewAnchor, setPreviewAnchor] = useState<PreviewAnchor | null>(null);
  return (
    <ul className="flex flex-col gap-px">
      {items.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          lang={lang}
          conversation={conversation}
          active={conversation.id === activeId}
          labels={labels}
          projectLabels={projectLabels}
          onNavigate={onNavigate}
          onHover={setPreviewAnchor}
        />
      ))}
      {previewAnchor && (
        <ConversationHoverPreview anchor={previewAnchor} labels={labels.preview} />
      )}
    </ul>
  );
}

function ConversationItem({
  lang,
  conversation,
  active,
  labels,
  projectLabels,
  onNavigate,
  onHover,
}: {
  lang: Locale;
  conversation: ConversationOut;
  active: boolean;
  labels: Labels;
  projectLabels: Dictionary["workspace"]["projects"];
  onNavigate: () => void;
  onHover: (anchor: PreviewAnchor | null) => void;
}) {
  const { projects, upsertConversation, removeConversation, notices, resolveThreadKey } = useWorkspace();
  // Les notifications sont indexées sur la clé de fil, qui reste locale pour
  // une conversation qui vient d'être créée : on résout avant de lire.
  const noticeFor = (conversation: ConversationOut) => notices[resolveThreadKey(conversation.id)];
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "menu" | "rename" | "delete" | "move" | "export">("idle");
  const [title, setTitle] = useState(conversation.title);
  const [busy, setBusy] = useState(false);
  const [moveError, setMoveError] = useState(false);
  const itemRef = useRef<HTMLLIElement>(null);
  // Nom du projet de rattachement, s'il existe encore (un projet supprimé ne
  // doit pas faire disparaître la conversation de la liste).
  const projectName = conversation.project_id
    ? projects.find((project) => project.id === conversation.project_id)?.name
    : undefined;
  const hover = useHoverPreview(
    (anchor) => onHover(anchor),
    () => onHover(null),
  );

  // Fermeture du menu au clic extérieur ou sur Échap.
  useEffect(() => {
    if (mode === "idle") return;
    const onPointer = (event: PointerEvent) => {
      if (!itemRef.current?.contains(event.target as Node)) setMode("idle");
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMode("idle");
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [mode]);

  const rename = async () => {
    const next = title.trim();
    if (!next || next === conversation.title) return setMode("idle");
    setBusy(true);
    const response = await fetch(`/api/donna/chat/${encodeURIComponent(conversation.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: next }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) upsertConversation({ ...conversation, title: next });
    setMode("idle");
  };

  const remove = async () => {
    setBusy(true);
    const response = await fetch(`/api/donna/chat/${encodeURIComponent(conversation.id)}`, { method: "DELETE" }).catch(
      () => null,
    );
    setBusy(false);
    if (!response?.ok) return setMode("idle");
    removeConversation(conversation.id);
    // Conversation ouverte supprimée : retour à une nouvelle conversation.
    if (pathname.includes(`/app/c/${conversation.id}`)) router.push(`/${lang}/app`);
  };

  const moveTo = async (projectId: string | null) => {
    setBusy(true);
    setMoveError(false);
    const response = await fetch(`/api/donna/chat/${encodeURIComponent(conversation.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: projectId ?? "" }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) return setMoveError(true);
    upsertConversation({ ...conversation, project_id: projectId });
    setMode("idle");
  };

  if (mode === "rename") {
    return (
      <li ref={itemRef}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void rename();
          }}
          className="flex items-center gap-1 px-1 py-0.5"
        >
          <label className="sr-only" htmlFor={`rename-${conversation.id}`}>
            {labels.renameLabel}
          </label>
          <input
            id={`rename-${conversation.id}`}
            autoFocus
            value={title}
            maxLength={255}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            className="h-8 min-w-0 flex-1 rounded-badge border border-bordeaux-700 bg-white px-2 text-label text-ink outline-none"
          />
          <button type="submit" disabled={busy} className="rounded-badge px-2 py-1 text-meta font-medium text-bordeaux-700">
            {labels.save}
          </button>
        </form>
      </li>
    );
  }

  return (
    <li ref={itemRef} className="group relative">
      <Link
        href={`/${lang}/app/c/${conversation.id}`}
        onClick={onNavigate}
        onMouseEnter={hover.onMouseEnter}
        onMouseLeave={hover.onMouseLeave}
        data-conversation-id={conversation.id}
        aria-current={active ? "page" : undefined}
        className={`flex h-9 items-center gap-2.5 rounded-nav pr-9 pl-2.5 text-label no-underline transition-colors duration-(--duration-fast) ${
          active ? "bg-active font-medium text-ink" : "text-ink-2 hover:bg-active/70 hover:text-ink"
        }`}
      >
        {projectName ? (
          <>
            {/* Conversation rattachée : l'icône dossier remplace celle de la
                discussion, et le nom du projet rappelle où elle vit. */}
            <FolderIcon size={16} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
            <span title={projectName} className="min-w-0 max-w-20 shrink-0 truncate text-meta text-ink-3">
              {projectName}
            </span>
          </>
        ) : (
          <>
            <ChatIcon size={16} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
          </>
        )}
        {/* Réponse reçue (ou question posée) pendant que l'utilisateur était
            sur une autre conversation. `question` est mise en avant : elle
            attend une action de sa part. */}
        {noticeFor(conversation) && (
          <span
            className={`ml-auto size-1.5 shrink-0 rounded-full ${noticeFor(conversation) === "response" ? "bg-ink-3/50" : "bg-bordeaux-700"}`}
          >
            <span className="sr-only">
              {noticeFor(conversation) === "question"
                ? labels.newQuestion
                : noticeFor(conversation) === "reminder"
                  ? labels.newReminder
                  : noticeFor(conversation) === "notification"
                    ? labels.newNotification
                    : labels.newResponse}
            </span>
          </span>
        )}
      </Link>
      <button
        type="button"
        aria-label={labels.more}
        aria-expanded={mode === "menu" || mode === "delete" || mode === "export"}
        onClick={() => setMode(mode === "idle" ? "menu" : "idle")}
        className={`absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-badge text-ink-3 hover:bg-white hover:text-ink focus-visible:opacity-100 ${
          active || mode !== "idle" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <MoreIcon size={16} />
      </button>

      {mode === "menu" && (
        <div role="menu" className="absolute top-full right-1 z-10 mt-1 w-48 rounded-card bg-white p-1 shadow-float">
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setTitle(conversation.title);
              setMode("rename");
            }}
            className="flex w-full rounded-badge px-2.5 py-2 text-left text-label text-ink hover:bg-active"
          >
            {labels.rename}
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setMoveError(false);
              setMode("move");
            }}
            className="flex w-full rounded-badge px-2.5 py-2 text-left text-label text-ink hover:bg-active"
          >
            {projectLabels.moveToProject}
          </button>
          {conversation.project_id && (
            <button
              role="menuitem"
              type="button"
              disabled={busy}
              onClick={() => void moveTo(null)}
              className="flex w-full rounded-badge px-2.5 py-2 text-left text-label text-ink hover:bg-active disabled:opacity-60"
            >
              {projectLabels.removeFromProject}
            </button>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => setMode("export")}
            className="flex w-full rounded-badge px-2.5 py-2 text-left text-label text-ink hover:bg-active"
          >
            {labels.export}
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => setMode("delete")}
            className="flex w-full rounded-badge px-2.5 py-2 text-left text-label text-danger hover:bg-danger/[0.06]"
          >
            {labels.delete}
          </button>
        </div>
      )}
      {mode === "export" && (
        <div role="menu" aria-label={labels.export} className="absolute top-full right-1 z-10 mt-1 w-48 rounded-card bg-white p-1 shadow-float">
          <p className="px-2.5 py-1.5 text-meta font-medium text-ink-3">{labels.export}</p>
          {EXPORT_FORMATS.map((format) => (
            <a
              key={format}
              role="menuitem"
              href={exportHref(conversation.id, format, lang)}
              download
              onClick={() => setMode("idle")}
              className="flex w-full rounded-badge px-2.5 py-2 text-left text-label text-ink no-underline hover:bg-active hover:text-ink"
            >
              {labels.exportFormats[format]}
            </a>
          ))}
        </div>
      )}
      {mode === "move" && (
        <div role="menu" aria-label={projectLabels.moveToProjectTitle} className="absolute top-full right-1 left-1 z-10 mt-1 max-h-64 overflow-y-auto rounded-card bg-white p-1 shadow-float">
          <p className="px-2.5 py-1.5 text-meta font-medium text-ink-3">{projectLabels.moveToProjectTitle}</p>
          {moveError && <p className="px-2.5 pb-1.5 text-meta text-danger">{projectLabels.moveError}</p>}
          {!projects.filter((p) => p.id !== conversation.project_id).length ? (
            <p className="px-2.5 py-2 text-secondary text-ink-3">{projectLabels.noOtherProjects}</p>
          ) : (
            projects
              .filter((p) => p.id !== conversation.project_id)
              .map((project) => (
                <button
                  key={project.id}
                  role="menuitem"
                  type="button"
                  disabled={busy}
                  onClick={() => void moveTo(project.id)}
                  className="flex w-full truncate rounded-badge px-2.5 py-2 text-left text-label text-ink hover:bg-active disabled:opacity-60"
                >
                  {project.name}
                </button>
              ))
          )}
        </div>
      )}
      {mode === "delete" && (
        <div role="alertdialog" aria-label={labels.delete} className="absolute top-full right-1 left-1 z-10 mt-1 rounded-card bg-white p-3 shadow-float">
          <p className="text-secondary text-ink-2 text-pretty">{labels.deleteConfirm}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setMode("idle")} className="rounded-button px-2.5 py-1.5 text-secondary font-medium text-ink hover:bg-active">
              {labels.cancel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="rounded-button bg-danger px-2.5 py-1.5 text-secondary font-medium text-white disabled:opacity-60"
            >
              {labels.delete}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function AccountMenu({ lang, labels, languageLabel, account }: { lang: Locale; labels: Labels; languageLabel: string; account: Account }) {
  const { setSettingsOpen } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative border-t border-border p-3">
      {open && (
        <div className="absolute right-3 bottom-full left-3 mb-1 rounded-card bg-white p-2 shadow-float">
          <p className="truncate px-2 pt-1 text-meta text-ink-3">{account.email}</p>
          <div className="mt-2 flex items-center justify-between px-1">
            <span className="text-secondary text-ink-2">{languageLabel}</span>
            <LanguageSwitch current={lang} label={languageLabel} />
          </div>
          <div className="mt-1.5 border-t border-border pt-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-badge px-2 py-2 text-left text-label text-ink hover:bg-active"
            >
              <SettingsIcon size={17} className="text-ink-2" />
              {labels.settings}
            </button>
          </div>
          <form action={logout} className="mt-1.5 border-t border-border pt-1.5">
            <input type="hidden" name="lang" value={lang} />
            <button type="submit" className="flex w-full items-center gap-2.5 rounded-badge px-2 py-2 text-left text-label text-ink hover:bg-active">
              <LogoutIcon size={17} className="text-ink-2" />
              {labels.signOut}
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={labels.account}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-nav p-1.5 text-left hover:bg-active"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-peche-100 text-label font-medium text-bordeaux-900">
          {account.initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-label font-medium text-ink">{account.name}</span>
          <span className="truncate text-meta text-ink-3">{account.workspace ?? labels.owner}</span>
        </span>
        <ChevronIcon size={16} className={`text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}
