"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type {
  ConversationOut,
  MentionSelection,
  ProjectDocumentBatchOut,
  ProjectDocumentOut,
  ProjectFactOut,
  ProjectInviteOut,
  ProjectMemberOut,
  ProjectOut,
  ProjectRole,
} from "@/lib/workspace-types";
import { parseBackendDate, PROJECT_INSTRUCTIONS_MAX } from "@/lib/workspace-types";
import { Composer } from "./conversation";
import { Dialog, DialogHeader } from "./dialog";
import { FileLink } from "./file-viewer";
import { RejectedFiles, type RejectedFile } from "./rejected-files";
import { ChatIcon, ChevronIcon, FileIcon, FolderIcon, LockIcon, MoreIcon, PencilIcon, PlusIcon, TrashIcon, UploadIcon, UsersIcon } from "./icons";
import { GoogleDriveIcon } from "./brand-icons";
import { DrivePicker, type ExistingDocument } from "./drive-picker";
import { DriveFolderImportProgress } from "./drive-folder-import-progress";
import { NasSection } from "./nas-section";
import { MemoryPolicyBlock } from "./memory-policy-block";
import { MemoryQuotaBlock } from "./memory-quota-block";
import { ContextWindowCard } from "./context-window-card";
import { inviteErrorKind, projectInviteLink, spaceInviteLink, spaceStatusKey, type InviteErrorKind } from "@/lib/project-invites";
import { startDriveFolderImport, type DriveFolderImportRun } from "@/lib/drive-folder-import";
import { AgentsCard } from "./agents-manager";
import { ProjectIcon, ProjectIconPicker } from "./project-icon";
import type { DriveErrorCode, DriveFileOut } from "@/lib/drive";
import { authorName, canSave, deletePath, historyPath, isConflict, lastChange, type FactVersion } from "@/lib/project-memory";
import { useWorkspace } from "./workspace-provider";

type WorkspaceDict = Dictionary["workspace"];
type Labels = WorkspaceDict["projects"];

const roleLabel = (labels: Labels, role: ProjectRole | string) =>
  role === "owner" ? labels.roleOwner : role === "editor" ? labels.roleEditor : labels.roleViewer;

const fieldClass =
  "w-full rounded-button border border-border bg-surface px-3 text-message text-ink placeholder:text-ink-3 focus:border-brand focus:shadow-focus focus:outline-none";
const primaryButton = "rounded-button bg-brand-fill px-3.5 py-2 text-label font-medium text-white hover:bg-brand-fill-strong disabled:opacity-60";
const ghostButton = "rounded-button px-3.5 py-2 text-label font-medium text-ink hover:bg-active";

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null; status: number }> {
  try {
    const response = await fetch(`/api/donna/chat/projects${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
    const data = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, data, status: response.status };
  } catch {
    return { ok: false, data: null, status: 0 };
  }
}

// Pas de header content-type ici : le navigateur doit fixer lui-même la
// frontière multipart pour FormData — api() ci-dessus force du JSON, donc
// inutilisable pour un upload de fichier.
// Plusieurs fichiers = UNE requête (le backend les traite en parallèle) : N
// requêtes simultanées se disputeraient aussi le renouvellement du jeton
// (le refresh token est à usage unique, voir app/api/donna/[...path]/route.ts).
async function uploadDocuments(
  projectId: string,
  files: File[],
): Promise<{ ok: boolean; batch: ProjectDocumentBatchOut | null; status: number }> {
  try {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const response = await fetch(`/api/donna/chat/projects/${encodeURIComponent(projectId)}/documents/batch`, {
      method: "POST",
      body: form,
    });
    const batch = (await response.json().catch(() => null)) as ProjectDocumentBatchOut | null;
    return { ok: response.ok, batch: response.ok ? batch : null, status: response.status };
  } catch {
    return { ok: false, batch: null, status: 0 };
  }
}

// Même plafond que DONNA_PROJECT_MAX_FILES_PER_UPLOAD côté backend (10 par défaut) :
// une sélection plus grande part en plusieurs envois successifs. Ne s'applique
// pas à l'import d'un dossier Drive entier (voir DriveFolderImportProgress).
const UPLOAD_BATCH_SIZE = 10;

/**
 * Page d'un projet, organisée autour du travail : écrire à DONNA et retrouver
 * les conversations (colonne principale), puis ce qui oriente ses réponses —
 * instructions, fichiers, mémoire (colonne latérale). L'administration
 * (membres, invitations, suppression) vit dans « Partager » et le menu « … ».
 */
export function ProjectDetail({
  lang,
  dict,
  project,
  initialMembers,
  initialInvites,
  initialConversations,
  initialFacts,
  initialDocuments,
  currentUserId,
}: {
  lang: Locale;
  dict: WorkspaceDict;
  project: ProjectOut;
  initialMembers: ProjectMemberOut[];
  initialInvites: ProjectInviteOut[];
  initialConversations: ConversationOut[];
  initialFacts: ProjectFactOut[];
  initialDocuments: ProjectDocumentOut[];
  currentUserId: string;
}) {
  const labels = dict.projects;
  const { projects, upsertProject, removeProject, memoryTicks } = useWorkspace();
  const router = useRouter();
  const isOwner = project.my_role === "owner";
  const canEdit = project.my_role !== "viewer";
  // Reflète les mises à jour poussées en temps réel (use-project-ws.ts) et les
  // modifications locales : `project` reste la donnée initiale du serveur.
  const liveProject = projects.find((p) => p.id === project.id) ?? project;
  const [members, setMembers] = useState(initialMembers);
  const [editing, setEditing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const leave = () => {
    removeProject(project.id);
    router.push(`/${lang}/app`);
  };

  return (
    <div className="scrollbar-none flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[68rem] flex-col gap-8 px-4 py-6 md:px-8 md:py-8">
        <nav aria-label={labels.indexTitle} className="flex items-center gap-1.5 text-label text-ink-3">
          <Link href={`/${lang}/app/projects`} className="no-underline hover:text-ink">
            {labels.indexTitle}
          </Link>
          <ChevronIcon size={12} className="-rotate-90" />
          <span className="truncate font-medium text-ink-2">{liveProject.name}</span>
        </nav>

        {editing ? (
          <HeaderForm labels={labels} project={liveProject} onCancel={() => setEditing(false)} onSaved={(p) => (upsertProject(p), setEditing(false))} />
        ) : (
          <header className="flex flex-wrap items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-card bg-peche-100 text-brand">
              <ProjectIcon icon={liveProject.icon} size={24} />
            </span>
            <div className="min-w-[12rem] flex-1">
              <h1 className="text-hero-sm font-medium text-balance text-ink">{liveProject.name}</h1>
              {liveProject.description ? (
                <p className="mt-1 max-w-2xl text-message text-ink-2 text-pretty">{liveProject.description}</p>
              ) : (
                isOwner && (
                  <button type="button" onClick={() => setEditing(true)} className="mt-1 text-message text-ink-3 hover:text-brand">
                    {labels.addDescription}
                  </button>
                )
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-2 rounded-button border border-border bg-surface py-1.5 pr-3 pl-1.5 text-label font-medium text-ink hover:border-brand/30"
              >
                <MemberStack members={members} />
                {isOwner ? labels.share : labels.membersTitle}
              </button>
              <ProjectMenu
                labels={labels}
                isOwner={isOwner}
                onEdit={() => setEditing(true)}
                onDelete={() => setDeleteOpen(true)}
                onLeave={() => setShareOpen(true)}
              />
            </div>
          </header>
        )}

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="flex min-w-0 flex-col gap-8">
            {/* Le Composer porte sa propre marge (conçue pour le chat) : compensée ici. */}
            <div className="-mx-4 -mb-4 md:-mx-8">
              <InlineComposer lang={lang} dict={dict} projectId={project.id} />
            </div>
            <ConversationsList lang={lang} labels={labels} conversations={initialConversations} />
          </div>

          <aside className="flex flex-col gap-4">
            <InstructionsCard labels={labels} project={liveProject} isOwner={isOwner} onSaved={upsertProject} />
            <AgentsCard lang={lang} labels={dict.agents} projectLabels={labels} projectId={project.id} canEdit={canEdit} />
            <FilesCard
              lang={lang}
              driveLabels={dict.drive}
              labels={labels}
              projectId={project.id}
              initialDocuments={initialDocuments}
              canEdit={canEdit}
              contextChunksUsed={liveProject.context_chunks_used}
              contextChunksLimit={liveProject.context_chunks_limit}
            />
            <MemoryCard labels={labels} projectId={project.id} initialFacts={initialFacts} canEdit={canEdit} members={members} currentUserId={currentUserId} />
            {/* Relue quand ce qui la compose change : consignes, mémoire (poussée en temps réel), nombre de documents. */}
            <ContextWindowCard
              lang={lang}
              labels={labels}
              projectId={project.id}
              conversations={initialConversations}
              refreshKey={`${memoryTicks[project.id] ?? 0}:${liveProject.updated_at}:${liveProject.document_count}`}
            />
          </aside>
        </div>
      </div>

      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} label={labels.shareTitle.replace("{name}", liveProject.name)} className="flex max-h-[min(44rem,calc(100dvh-2rem))] max-w-[36rem] flex-col">
        <DialogHeader title={labels.shareTitle.replace("{name}", liveProject.name)} subtitle={labels.shareHint} closeLabel={labels.close} onClose={() => setShareOpen(false)} />
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
          {isOwner && <InviteForm labels={labels} projectId={project.id} initialInvites={initialInvites} />}
          <MembersList
            labels={labels}
            projectId={project.id}
            isOwner={isOwner}
            currentUserId={currentUserId}
            members={members}
            setMembers={setMembers}
            onLeave={leave}
          />
        </div>
      </Dialog>

      {isOwner && (
        <DeleteDialog
          labels={labels}
          open={deleteOpen}
          projectId={project.id}
          name={liveProject.name}
          onClose={() => setDeleteOpen(false)}
          onDeleted={leave}
        />
      )}
    </div>
  );
}

/* ── En-tête ─────────────────────────────────────────────────────────────────── */

function HeaderForm({ labels, project, onCancel, onSaved }: { labels: Labels; project: ProjectOut; onCancel: () => void; onSaved: (project: ProjectOut) => void }) {
  const [name, setName] = useState(project.name);
  const [icon, setIcon] = useState(project.icon);
  const [description, setDescription] = useState(project.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const nameId = useId();
  const descId = useId();

  const save = async () => {
    setBusy(true);
    setError(false);
    const { ok, data } = await api<ProjectOut>(`/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim(), icon, description: description.trim() || null }),
    });
    setBusy(false);
    if (ok && data) onSaved(data);
    else setError(true);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex max-w-2xl flex-col gap-3"
    >
      <label htmlFor={nameId} className="text-label font-medium text-ink">
        {labels.nameLabel}
      </label>
      <input id={nameId} autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={`h-11 text-panel-title ${fieldClass}`} />
      <ProjectIconPicker value={icon} onChange={setIcon} label={labels.iconLabel} names={labels.iconNames} />
      <label htmlFor={descId} className="text-label font-medium text-ink">
        {labels.descriptionLabel}
      </label>
      <textarea id={descId} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={`resize-none py-2 ${fieldClass}`} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy || !name.trim()} className={primaryButton}>
          {busy ? labels.saving : labels.save}
        </button>
        <button type="button" onClick={onCancel} className={ghostButton}>
          {labels.cancel}
        </button>
        {error && <span className="text-secondary text-danger">{labels.saveError}</span>}
      </div>
    </form>
  );
}

const initialsOf = (member: ProjectMemberOut) => (member.email ?? member.user_id).slice(0, 2).toUpperCase();

/** Pastilles des premiers membres, chevauchées. */
function MemberStack({ members }: { members: ProjectMemberOut[] }) {
  const shown = members.slice(0, 3);
  return (
    <span aria-hidden className="flex -space-x-1.5">
      {shown.map((member) => (
        <span key={member.user_id} className="flex size-6 items-center justify-center rounded-full bg-peche-100 text-micro font-medium text-brand-strong ring-2 ring-white">
          {initialsOf(member)}
        </span>
      ))}
      {members.length > shown.length && (
        <span className="flex size-6 items-center justify-center rounded-full bg-active text-micro font-medium text-ink-2 ring-2 ring-white">+{members.length - shown.length}</span>
      )}
      {!members.length && (
        <span className="flex size-6 items-center justify-center rounded-full bg-active text-ink-3 ring-2 ring-white">
          <UsersIcon size={13} />
        </span>
      )}
    </span>
  );
}

function ProjectMenu({ labels, isOwner, onEdit, onDelete, onLeave }: { labels: Labels; isOwner: boolean; onEdit: () => void; onDelete: () => void; onLeave: () => void }) {
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

  const item = "flex w-full items-center gap-2.5 rounded-badge px-2.5 py-2 text-left text-label hover:bg-active";
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={labels.more}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-9 items-center justify-center rounded-button border border-border bg-surface text-ink-2 hover:text-ink"
      >
        <MoreIcon size={18} />
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-20 mt-1 w-56 rounded-card bg-surface p-1.5 shadow-float">
          {isOwner ? (
            <>
              <button role="menuitem" type="button" onClick={run(onEdit)} className={`${item} text-ink`}>
                <PencilIcon size={16} className="text-ink-3" />
                {labels.editDetails}
              </button>
              <button role="menuitem" type="button" onClick={run(onDelete)} className={`${item} text-danger`}>
                <TrashIcon size={16} />
                {labels.deleteProject}
              </button>
            </>
          ) : (
            <button role="menuitem" type="button" onClick={run(onLeave)} className={`${item} text-danger`}>
              <UsersIcon size={16} />
              {labels.leaveProject}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Colonne principale ──────────────────────────────────────────────────────── */

/** Même Composer que le chat. Envoyer ici dépose le brouillon dans WorkspaceProvider
 * (voir conversation.tsx) puis amène sur /app pour voir la réponse : on ne duplique
 * pas la boucle de streaming ici. */
function InlineComposer({ lang, dict, projectId }: { lang: Locale; dict: WorkspaceDict; projectId: string }) {
  const { setProjectDraft } = useWorkspace();
  const router = useRouter();
  // Agent choisi avant d'écrire : il part avec le brouillon et devient celui de la nouvelle conversation.
  const [agentId, setAgentId] = useState<string | null>(null);

  const handleSend = async (text: string, files: File[], webSearch: boolean, mentions: MentionSelection) => {
    setProjectDraft({ message: text, files, webSearch, mentions, agentId });
    router.push(`/${lang}/app?project=${projectId}`);
  };

  return (
    <Composer
      lang={lang}
      dict={dict}
      busy={false}
      conversationId={null}
      onSend={handleSend}
      onStop={() => {}}
      autoFocus={false}
      agent={{ projectId, value: agentId, onChange: setAgentId }}
    />
  );
}

function ConversationsList({ lang, labels, conversations }: { lang: Locale; labels: Labels; conversations: ConversationOut[] }) {
  return (
    <section aria-labelledby="project-conversations" className="flex flex-col gap-2">
      <h2 id="project-conversations" className="flex items-baseline gap-2 text-panel-title font-medium text-ink">
        {labels.conversationsTitle}
        {conversations.length > 0 && <span className="text-label font-normal text-ink-3 tabular-nums">{conversations.length}</span>}
      </h2>
      {!conversations.length ? (
        <div className="flex items-center gap-3 rounded-card border border-dashed border-border px-4 py-5">
          <ChatIcon size={18} className="shrink-0 text-ink-3" />
          <p className="text-secondary text-ink-3 text-pretty">{labels.recentEmpty}</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {conversations.map((conversation) => {
            const at = parseBackendDate(conversation.updated_at ?? conversation.created_at);
            return (
              <li key={conversation.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/${lang}/app/c/${conversation.id}`}
                  className="group -mx-3 flex items-center justify-between gap-3 rounded-nav px-3 py-3 text-label text-ink no-underline hover:bg-active/60"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ChatIcon size={16} className="shrink-0 text-ink-3" />
                    <span className="truncate group-hover:text-brand-strong">{conversation.title}</span>
                  </span>
                  {at && (
                    <time className="shrink-0 text-meta text-ink-3" suppressHydrationWarning>
                      {new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(at)}
                    </time>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── Colonne latérale ────────────────────────────────────────────────────────── */

function Card({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-panel bg-surface shadow-card">
      <header className="flex min-h-12 items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h2 className="flex items-center gap-2 text-label font-medium text-ink">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function InstructionsCard({ labels, project, isOwner, onSaved }: { labels: Labels; project: ProjectOut; isOwner: boolean; onSaved: (project: ProjectOut) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.instructions ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const fieldId = useId();

  const save = async () => {
    setBusy(true);
    setError(false);
    const { ok, data } = await api<ProjectOut>(`/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ instructions: value.trim() || null }),
    });
    setBusy(false);
    if (ok && data) {
      onSaved(data);
      setEditing(false);
    } else setError(true);
  };

  return (
    <Card
      title={labels.instructionsTitle}
      action={
        isOwner &&
        !editing && (
          <button
            type="button"
            onClick={() => {
              setValue(project.instructions ?? "");
              setError(false);
              setEditing(true);
            }}
            className="rounded-badge px-2 py-1 text-meta font-medium text-brand hover:bg-active"
          >
            {project.instructions ? labels.edit : labels.add}
          </button>
        )
      }
    >
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="flex flex-col gap-2 px-4 pb-4"
        >
          <label htmlFor={fieldId} className="sr-only">
            {labels.instructionsTitle}
          </label>
          <textarea id={fieldId} autoFocus rows={6} value={value} maxLength={PROJECT_INSTRUCTIONS_MAX} onChange={(e) => setValue(e.target.value)} className={`resize-y py-2 text-secondary ${fieldClass}`} />
          <p className="text-meta text-ink-3">{labels.instructionsHint}</p>
          <p className="self-end text-meta tabular-nums text-ink-3">
            {labels.counter.replace("{n}", String(value.length)).replace("{max}", String(PROJECT_INSTRUCTIONS_MAX))}
          </p>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="rounded-button bg-brand-fill px-3 py-1.5 text-meta font-medium text-white hover:bg-brand-fill-strong disabled:opacity-60">
              {busy ? labels.saving : labels.save}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-button px-3 py-1.5 text-meta font-medium text-ink hover:bg-active">
              {labels.cancel}
            </button>
            {error && <span className="text-meta text-danger">{labels.saveError}</span>}
          </div>
        </form>
      ) : (
        <p className={`line-clamp-6 px-4 pb-4 text-secondary whitespace-pre-wrap text-pretty ${project.instructions ? "text-ink-2" : "text-ink-3"}`}>
          {project.instructions || labels.instructionsEmptyHint}
        </p>
      )}
    </Card>
  );
}

function FilesCard({
  lang,
  driveLabels,
  labels,
  projectId,
  initialDocuments,
  canEdit,
  contextChunksUsed,
  contextChunksLimit,
}: {
  lang: Locale;
  driveLabels: WorkspaceDict["drive"];
  labels: Labels;
  projectId: string;
  initialDocuments: ProjectDocumentOut[];
  canEdit: boolean;
  contextChunksUsed: number;
  contextChunksLimit: number;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<"upload" | "delete" | "capacity" | "retry" | "retryBusy" | "drive" | null>(null);
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveCode, setDriveCode] = useState<DriveErrorCode>("unavailable");
  // Noms des fichiers refusés lors du dernier dépôt (affichés dans le message d'erreur).
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [folderImports, setFolderImports] = useState<DriveFolderImportRun[]>([]);
  const [fileQuery, setFileQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // Statut d'ingestion en direct (websocket, voir workspace-provider.tsx) —
  // sans ça, un document reste affiché "en attente" indéfiniment même une
  // fois traité (avec succès ou en échec), tant que la page n'est pas rechargée.
  // Dérivé au rendu (pas de setState dans un effet) : `documents` ne garde
  // que l'ajout/suppression, `documentStatuses` (externe) s'applique par-dessus.
  const { documentStatuses } = useWorkspace();
  const displayDocuments = useMemo(
    () =>
      documents.map((doc) => {
        const update = documentStatuses[doc.id];
        if (!update) return doc;
        return { ...doc, status: update.status, chunk_count: update.chunkCount, error: update.error };
      }),
    [documents, documentStatuses],
  );
  // Onglet « Dans ce projet » du sélecteur Drive (évite de réimporter un doublon) : même statut en direct
  // que la liste principale, label traduit ici (DrivePicker n'a pas les libellés docStatus du projet).
  const existingDocuments = useMemo<ExistingDocument[]>(
    () =>
      displayDocuments.map((doc) => ({
        id: doc.id,
        name: doc.original_name,
        statusLabel: doc.status in labels.docStatus ? labels.docStatus[doc.status as keyof Labels["docStatus"]] : null,
        url: `/api/donna/chat/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(doc.id)}/file`,
      })),
    [displayDocuments, labels.docStatus, projectId],
  );
  // Le blocage réel est appliqué côté serveur (400) — ce garde-fou évite juste
  // une requête vouée à l'échec quand la limite est visiblement atteinte.
  const atCapacity = contextChunksLimit > 0 && contextChunksUsed >= contextChunksLimit;
  const percent = contextChunksLimit > 0 ? Math.min(100, Math.round((contextChunksUsed / contextChunksLimit) * 100)) : 0;

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    if (atCapacity) return setError("capacity");
    setError(null);
    setRejected([]);
    setUploading((n) => n + list.length);
    for (let start = 0; start < list.length; start += UPLOAD_BATCH_SIZE) {
      const group = list.slice(start, start + UPLOAD_BATCH_SIZE);
      const { ok, batch, status } = await uploadDocuments(projectId, group);
      setUploading((n) => n - group.length);
      if (ok && batch) {
        if (batch.documents.length) setDocuments((docs) => [...batch.documents, ...docs]);
        if (batch.errors.length) {
          setError("upload");
          setRejected((files) => [...files, ...batch.errors.map((e) => ({ name: e.filename, reason: e.detail }))]);
        }
      } else {
        setError(status === 400 ? "capacity" : "upload");
        setRejected((files) => [...files, ...group.map((f) => ({ name: f.name }))]);
      }
    }
  };

  // Import depuis Google Drive : le backend récupère les fichiers (jeton Google gardé serveur) et les
  // indexe comme un dépôt groupé — mêmes lignes, mêmes erreurs par fichier.
  const importFromDrive = async (picked: DriveFileOut[]) => {
    if (!picked.length) return;
    if (atCapacity) return setError("capacity");
    setError(null);
    setRejected([]);
    setUploading((n) => n + picked.length);
    const { ok, data, status } = await api<ProjectDocumentBatchOut & { detail?: { code?: DriveErrorCode } }>(`/${projectId}/documents/drive`, {
      method: "POST",
      body: JSON.stringify({ file_ids: picked.map((file) => file.id) }),
    });
    setUploading((n) => n - picked.length);
    if (ok && data) {
      if (data.documents.length) setDocuments((docs) => [...data.documents, ...docs]);
      if (data.errors.length) {
        setError("upload");
        setRejected(data.errors.map((e) => ({ name: e.filename, reason: e.detail })));
      }
      return;
    }
    const code = data?.detail && typeof data.detail === "object" ? data.detail.code : undefined;
    if (code) {
      setDriveCode(code);
      setError("drive");
    } else {
      setError(status === 400 ? "capacity" : "upload");
      setRejected(picked.map((file) => ({ name: file.name })));
    }
  };

  // Import RÉCURSIF d'un dossier Drive entier : tourne en tâche de fond côté serveur (potentiellement des
  // centaines de fichiers) — on garde juste le run renvoyé par le démarrage, DriveFolderImportProgress suit
  // sa progression lui-même. Plusieurs dossiers peuvent s'importer en parallèle (pas de fermeture du
  // sélecteur, voir DrivePicker). Jamais bloqué par `atCapacity` : la tâche de fond vérifie la capacité en
  // continu et s'arrête proprement (capacity_reached) plutôt que de refuser de démarrer.
  const importFolder = async (file: DriveFileOut) => {
    const run = await startDriveFolderImport(projectId, file.id, file.name);
    if (run) setFolderImports((runs) => [run, ...runs]);
    else {
      setError("drive");
      setDriveCode("unavailable");
    }
  };

  const refreshDocuments = async () => {
    const { ok, data } = await api<ProjectDocumentOut[]>(`/${projectId}/documents`);
    if (ok && data) setDocuments(data);
  };

  const dismissFolderImport = (runId: string) => setFolderImports((runs) => runs.filter((r) => r.id !== runId));

  const retry = async (id: string) => {
    setError(null);
    const { ok, data, status } = await api<ProjectDocumentOut>(`/${projectId}/documents/${encodeURIComponent(id)}/reingest`, { method: "POST" });
    if (ok && data) setDocuments((docs) => docs.map((d) => (d.id === id ? { ...d, status: data.status, error: null } : d)));
    else setError(status === 409 ? "retryBusy" : "retry");
  };

  const remove = async (id: string) => {
    const { ok } = await api<{ deleted: boolean }>(`/${projectId}/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (ok) setDocuments((docs) => docs.filter((d) => d.id !== id));
    else setError("delete");
  };

  const dropProps = canEdit
    ? {
        onDragOver: (event: React.DragEvent) => {
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: (event: React.DragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        },
        onDrop: (event: React.DragEvent) => {
          event.preventDefault();
          setDragging(false);
          void uploadFiles(event.dataTransfer.files);
        },
      }
    : {};

  return (
    <div {...dropProps} className={`rounded-panel transition-shadow ${dragging ? "shadow-focus" : ""}`}>
      <Card
        title={
          <>
            {labels.filesTitle}
            {documents.length > 0 && <span className="font-normal text-ink-3 tabular-nums">{documents.length}</span>}
          </>
        }
        action={
          canEdit && (
            <span className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={atCapacity}
                onClick={() => setDriveOpen(true)}
                aria-label={labels.addFromDrive}
                title={labels.addFromDrive}
                className="flex size-7 items-center justify-center rounded-badge text-ink-2 hover:bg-active disabled:opacity-40"
              >
                <GoogleDriveIcon size={15} />
              </button>
              <button
                type="button"
                disabled={atCapacity}
                onClick={() => fileRef.current?.click()}
                aria-label={labels.addFromComputer}
                title={labels.addFromComputer}
                className="flex size-7 items-center justify-center rounded-badge text-ink-2 hover:bg-active hover:text-brand disabled:opacity-40"
              >
                <PlusIcon size={16} />
              </button>
              <button
                type="button"
                disabled={atCapacity}
                onClick={() => folderRef.current?.click()}
                aria-label={labels.addFromFolder}
                title={labels.addFromFolder}
                className="flex size-7 items-center justify-center rounded-badge text-ink-2 hover:bg-active hover:text-brand disabled:opacity-40"
              >
                <FolderIcon size={15} />
              </button>
            </span>
          )
        }
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void uploadFiles(event.target.files);
            event.target.value = "";
          }}
        />
        {/* Sélection d'un dossier LOCAL entier (hors Drive) : le navigateur résout lui-même tous les fichiers,
         * sous-dossiers compris, en une FileList à plat — réutilise uploadFiles() tel quel (déjà envoyé par lots
         * de UPLOAD_BATCH_SIZE), aucun changement côté serveur. webkitdirectory n'est pas dans les types React
         * mais est supporté par tous les navigateurs de bureau modernes. */}
        <input
          ref={folderRef}
          type="file"
          multiple
          hidden
          // @ts-expect-error -- webkitdirectory/directory : attributs DOM réels, absents des types React
          webkitdirectory=""
          directory=""
          onChange={(event) => {
            if (event.target.files) void uploadFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {contextChunksLimit > 0 && (
          <div className="px-4 pb-3" title={labels.contextCapacity.replace("{used}", String(contextChunksUsed)).replace("{limit}", String(contextChunksLimit))}>
            <div className="h-1.5 overflow-hidden rounded-full bg-active" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={labels.capacityLabel}>
              <div className={`h-full rounded-full ${atCapacity ? "bg-danger" : percent > 80 ? "bg-brand-fill" : "bg-rose-300"}`} style={{ width: `${Math.max(percent, contextChunksUsed ? 2 : 0)}%` }} />
            </div>
            <p className={`mt-1.5 text-meta ${atCapacity ? "text-danger" : "text-ink-3"}`}>
              {atCapacity ? labels.contextCapacityReached : labels.capacityPercent.replace("{n}", String(percent))}
            </p>
          </div>
        )}

        {displayDocuments.length > 0 && (
          <>
            {/* Au-delà d'une poignée de fichiers, beaucoup de noms se ressemblent une fois tronqués (ex.
             * plusieurs CV/lettres de motivation quasi identiques) — un filtre texte local règle ça sans
             * requête serveur, la liste étant déjà chargée en entier. */}
            {displayDocuments.length > 8 && (
              <div className="border-t border-border px-3 pt-2">
                <input
                  type="search"
                  value={fileQuery}
                  onChange={(event) => setFileQuery(event.target.value)}
                  placeholder={labels.filesSearchPlaceholder}
                  aria-label={labels.filesSearchPlaceholder}
                  className="h-8 w-full rounded-button border border-border bg-surface px-3 text-meta text-ink placeholder:text-ink-3 focus:border-brand focus:shadow-focus focus:outline-none"
                />
              </div>
            )}
            {(() => {
              const q = fileQuery.trim().toLowerCase();
              const filteredDocuments = q ? displayDocuments.filter((doc) => doc.original_name.toLowerCase().includes(q)) : displayDocuments;
              return filteredDocuments.length === 0 ? (
                <p className="px-4 py-3 text-meta text-ink-3">{labels.filesSearchEmpty}</p>
              ) : (
                // Hauteur bornée + défilement propre à la liste : un projet avec des dizaines de fichiers ne
                // doit pas pousser le reste de la page (instructions, mémoire, agents...) hors de vue.
                <ul className="scrollbar-none flex max-h-[24rem] flex-col overflow-y-auto border-t border-border py-1">
                  {filteredDocuments.map((doc) => (
                    <li key={doc.id} className="group flex items-center gap-2 px-2">
                      <FileLink
                        url={`/api/donna/chat/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(doc.id)}/file`}
                        name={doc.original_name}
                        title={doc.original_name}
                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-badge px-2 py-2 text-label text-ink no-underline hover:bg-active"
                      >
                        <FileIcon size={16} className="shrink-0 text-brand" />
                        <span className="truncate">{doc.original_name}</span>
                        <DocStatus labels={labels} doc={doc} />
                      </FileLink>
                      {canEdit && (doc.status === "failed" || doc.status === "pending") && (
                        <button
                          type="button"
                          onClick={() => void retry(doc.id)}
                          aria-label={`${labels.retryIndexing} ${doc.original_name}`}
                          title={doc.error ? `${labels.retryIndexing} — ${doc.error}` : labels.retryIndexing}
                          className="shrink-0 rounded-badge px-2 py-1 text-meta text-brand hover:bg-active"
                        >
                          {labels.retryIndexing}
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => void remove(doc.id)}
                          aria-label={`${labels.deleteDocument} ${doc.original_name}`}
                          title={labels.deleteDocument}
                          className="shrink-0 rounded-badge p-1.5 text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-danger/[0.06] hover:text-danger focus:opacity-100"
                        >
                          <TrashIcon size={15} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              );
            })()}
          </>
        )}

        {uploading > 0 && <p className="border-t border-border px-4 py-2.5 text-meta text-ink-2">{labels.uploading.replace("{n}", String(uploading))}</p>}

        {folderImports.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border px-2 py-2">
            {folderImports.map((run) => (
              <DriveFolderImportProgress
                key={run.id}
                projectId={projectId}
                run={run}
                labels={labels.driveFolderImport}
                onFinished={() => void refreshDocuments()}
                onDismiss={() => dismissFolderImport(run.id)}
              />
            ))}
          </div>
        )}

        {/* Dossiers du NAS liés au projet : la section ne s'affiche que si le serveur dit que le connecteur existe pour cet espace. */}
        <NasSection lang={lang} labels={labels} projectId={projectId} canEdit={canEdit} onSynced={() => void refreshDocuments()} />

        <DrivePicker
          lang={lang}
          labels={driveLabels}
          open={driveOpen}
          onClose={() => setDriveOpen(false)}
          max={UPLOAD_BATCH_SIZE}
          confirmLabel="import"
          onConfirm={importFromDrive}
          onImportFolder={(file) => void importFolder(file)}
          existingDocuments={existingDocuments}
        />

        {!documents.length && !uploading && (
          <div className="px-4 pb-4">
            {canEdit ? (
              <>
                <button
                  type="button"
                  disabled={atCapacity}
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-1.5 rounded-card border border-dashed border-border px-4 py-5 text-center hover:border-brand/40 hover:bg-surface disabled:opacity-60"
                >
                  <UploadIcon size={20} className="text-ink-3" />
                  <span className="text-label font-medium text-ink">{labels.dropzoneHint}</span>
                  <span className="text-meta text-ink-3">{labels.dropzoneTypes}</span>
                </button>
                <button
                  type="button"
                  disabled={atCapacity}
                  onClick={() => setDriveOpen(true)}
                  className="mt-2 inline-flex items-center gap-2 text-label text-brand hover:text-brand-strong disabled:opacity-60"
                >
                  <GoogleDriveIcon size={15} />
                  {labels.addFromDrive}
                </button>
              </>
            ) : (
              <p className="text-secondary text-ink-3">{labels.documentsEmpty}</p>
            )}
          </div>
        )}

        {error && (
          <div role="alert" className="border-t border-border px-4 py-2.5 text-meta text-danger">
            {error === "upload"
              ? rejected.some((file) => file.reason)
                ? <RejectedFiles intro={labels.uploadErrorSome} files={rejected} />
                : rejected.length
                  ? labels.uploadErrorFiles.replace("{files}", rejected.map((file) => file.name).join(", "))
                  : labels.uploadError
              : error === "drive"
                ? ((driveLabels.errors as Record<string, string>)[driveCode] ?? driveLabels.errors.unavailable)
                : error === "delete"
                ? labels.deleteDocumentError
                : error === "retry"
                  ? labels.retryIndexingError
                  : error === "retryBusy"
                    ? labels.retryIndexingBusy
                    : labels.contextCapacityReached}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Statut d'indexation, affiché seulement tant que le fichier n'est pas exploitable. */
function DocStatus({ labels, doc }: { labels: Labels; doc: ProjectDocumentOut }) {
  const status = doc.status as keyof Labels["docStatus"];
  if (!(status in labels.docStatus)) return null;
  return (
    <span title={doc.error ?? undefined} className={`ml-auto shrink-0 text-meta ${status === "failed" ? "text-danger" : "text-ink-3"}`}>
      {labels.docStatus[status]}
    </span>
  );
}

function MemoryCard({
  labels,
  projectId,
  initialFacts,
  canEdit,
  members,
  currentUserId,
}: {
  labels: Labels;
  projectId: string;
  initialFacts: ProjectFactOut[];
  canEdit: boolean;
  members: ProjectMemberOut[];
  currentUserId: string;
}) {
  const [facts, setFacts] = useState(initialFacts);
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"add" | "delete" | "edit" | "conflictDelete" | "gone" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // La version enregistrée par quelqu'un d'autre pendant qu'on corrigeait : montrée avant tout écrasement (rien n'est perdu).
  const [conflict, setConflict] = useState<ProjectFactOut | null>(null);
  const [history, setHistory] = useState<{ scope: string; rows: FactVersion[] | null; failed: boolean } | null>(null);
  const factId = useId();

  const who = (userId: string | null | undefined) => authorName(userId, members, currentUserId, { you: labels.you, unknown: labels.memberUnknown });
  const when = (iso: string) => {
    const time = parseBackendDate(iso);
    return time === null ? "" : new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };
  const stampOf = (fact: ProjectFactOut) => {
    const change = lastChange(fact);
    const text = (change.edited ? labels.factEditedBy : labels.factAddedBy).replace("{name}", who(change.by)).replace("{date}", when(change.at));
    return change.version > 1 ? `${text} · ${labels.factVersion.replace("{n}", String(change.version))}` : text;
  };

  const loadFacts = async (): Promise<ProjectFactOut[] | null> => {
    const { ok, data } = await api<ProjectFactOut[]>(`/${projectId}/memory/facts`);
    if (ok && data) setFacts(data);
    return ok && data ? data : null;
  };

  // DONNA vient d'écrire dans la mémoire de ce projet (événement websocket, voir lib/user-channel.ts) : la liste se relit — sauf pendant
  // qu'on corrige un fait, pour ne pas écraser la saisie ; la jauge, elle, se relit toujours.
  const { memoryTicks } = useWorkspace();
  const memoryTick = memoryTicks[projectId] ?? 0;
  const editingRef = useRef<string | null>(null);
  useEffect(() => {
    editingRef.current = editingId;
  }, [editingId]);
  useEffect(() => {
    if (memoryTick === 0 || editingRef.current) return;
    void (async () => {
      const { ok, data } = await api<ProjectFactOut[]>(`/${projectId}/memory/facts`);
      if (ok && data) setFacts(data);
    })();
  }, [memoryTick, projectId]);

  const openHistory = async (factIdOrNull: string | null) => {
    const scope = factIdOrNull ?? "all";
    if (history?.scope === scope) {
      setHistory(null);
      return;
    }
    setHistory({ scope, rows: null, failed: false });
    const { ok, data } = await api<FactVersion[]>(historyPath(projectId, factIdOrNull));
    setHistory((current) => (current?.scope === scope ? { scope, rows: ok ? (data ?? []) : null, failed: !ok } : current));
  };

  const startEdit = (fact: ProjectFactOut) => {
    setEditingId(fact.id);
    setDraft(fact.fact);
    setConflict(null);
    setError(null);
  };

  const stopEdit = () => {
    setEditingId(null);
    setConflict(null);
  };

  const save = async (fact: ProjectFactOut) => {
    if (!canSave(draft, fact.fact, busy)) return;
    setBusy(true);
    setError(null);
    const { ok, data, status } = await api<ProjectFactOut>(`/${projectId}/memory/facts/${encodeURIComponent(fact.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ fact: draft.trim(), expected_version: fact.version }),
    });
    if (ok && data) {
      setFacts((list) => list.map((f) => (f.id === data.id ? data : f)));
      setHistory(null); // l'historique affiché ne serait plus à jour
      stopEdit();
    } else if (isConflict(status)) {
      const list = await loadFacts();
      const current = list?.find((f) => f.id === fact.id) ?? null;
      if (current) setConflict(current);
      else {
        stopEdit();
        setError("gone");
      }
    } else setError("edit");
    setBusy(false);
  };

  // « Garder mon texte » : on repart de la version enregistrée que la personne vient de voir, sans rien lui cacher.
  const keepMine = async () => {
    if (!conflict) return;
    const fresh = conflict;
    setConflict(null);
    await save(fresh);
  };

  const add = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await api<ProjectFactOut>(`/${projectId}/memory/facts`, {
      method: "POST",
      body: JSON.stringify({ fact: trimmed }),
    });
    setBusy(false);
    if (ok && data) {
      setFacts((list) => [data, ...list]);
      setValue("");
      setAdding(false);
    } else setError("add");
  };

  const remove = async (fact: ProjectFactOut) => {
    setError(null);
    const { ok, status } = await api<{ deleted: boolean }>(deletePath(projectId, fact.id, fact.version), { method: "DELETE" });
    if (ok) {
      setFacts((list) => list.filter((f) => f.id !== fact.id));
      setHistory(null);
    } else if (isConflict(status)) {
      await loadFacts(); // modifié entre-temps : la liste est rechargée, on ne l'oublie pas à l'aveugle
      setError("conflictDelete");
    } else setError("delete");
  };

  return (
    <Card
      title={
        <>
          {labels.memoryTitle}
          <span title={labels.memoryPrivateHint} className="inline-flex items-center gap-1 rounded-badge bg-fill px-1.5 py-0.5 text-meta font-normal text-ink-3">
            <LockIcon size={11} />
            {labels.memoryPrivate}
          </span>
        </>
      }
      action={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void openHistory(null)}
            aria-pressed={history?.scope === "all"}
            className="rounded-badge px-2 py-1 text-meta text-ink-2 hover:bg-active hover:text-brand aria-pressed:bg-active aria-pressed:text-brand"
          >
            {labels.memoryHistory}
          </button>
          {canEdit && !adding && (
            <button type="button" onClick={() => setAdding(true)} aria-label={labels.factAdd} title={labels.factAdd} className="flex size-7 items-center justify-center rounded-badge text-ink-2 hover:bg-active hover:text-brand">
              <PlusIcon size={16} />
            </button>
          )}
        </div>
      }
    >
      {adding && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
          className="flex flex-col gap-2 px-4 pb-3"
        >
          <label htmlFor={factId} className="sr-only">
            {labels.factPlaceholder}
          </label>
          <input
            id={factId}
            autoFocus
            value={value}
            placeholder={labels.factPlaceholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            className={`h-9 text-secondary ${fieldClass}`}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !value.trim()} className="rounded-button bg-brand-fill px-3 py-1.5 text-meta font-medium text-white hover:bg-brand-fill-strong disabled:opacity-60">
              {busy ? labels.factAdding : labels.factAdd}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-button px-3 py-1.5 text-meta font-medium text-ink hover:bg-active">
              {labels.cancel}
            </button>
          </div>
        </form>
      )}

      {!canEdit && <p className="px-4 pb-2 text-meta text-ink-3 text-pretty">{labels.memoryViewerHint}</p>}
      <MemoryPolicyBlock labels={labels} projectId={projectId} />
      <MemoryQuotaBlock labels={labels} projectId={projectId} refreshKey={memoryTick} />
      {facts.length ? (
        <ul className="flex flex-col border-t border-border py-1">
          {facts.map((fact) => (
            <li key={fact.id} className="group flex flex-col gap-1 px-4 py-2">
              <div className="flex items-start gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-rose-300" />
                {editingId === fact.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save(fact);
                    }}
                    className="flex min-w-0 flex-1 flex-col gap-2"
                  >
                    <label htmlFor={`${factId}-${fact.id}`} className="sr-only">
                      {labels.factEdit}
                    </label>
                    <textarea
                      id={`${factId}-${fact.id}`}
                      autoFocus
                      rows={3}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && stopEdit()}
                      className={`text-secondary ${fieldClass}`}
                    />
                    <div className="flex gap-2">
                      <button type="submit" disabled={!canSave(draft, fact.fact, busy)} className="rounded-button bg-brand-fill px-3 py-1.5 text-meta font-medium text-white hover:bg-brand-fill-strong disabled:opacity-60">
                        {busy ? labels.saving : labels.save}
                      </button>
                      <button type="button" onClick={stopEdit} className="rounded-button px-3 py-1.5 text-meta font-medium text-ink hover:bg-active">
                        {labels.cancel}
                      </button>
                    </div>
                  </form>
                ) : (
                  <span className="min-w-0 flex-1 whitespace-pre-wrap text-secondary text-ink-2 text-pretty">{fact.fact}</span>
                )}
                {canEdit && editingId !== fact.id && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(fact)}
                      aria-label={`${labels.factEdit} : ${fact.fact}`}
                      title={labels.factEdit}
                      className="shrink-0 rounded-badge p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-brand focus:opacity-100"
                    >
                      <PencilIcon size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(fact)}
                      aria-label={`${labels.factDelete} : ${fact.fact}`}
                      title={labels.factDelete}
                      className="shrink-0 rounded-badge p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </>
                )}
              </div>
              {conflict && conflict.id === fact.id && editingId === fact.id && (
                <div role="alert" className="ml-3 flex flex-col gap-2 rounded-button border border-border bg-fill p-3 text-meta text-ink-2">
                  <p>{lastChange(conflict).by === currentUserId ? labels.factConflictSelf : labels.factConflict.replace("{name}", who(lastChange(conflict).by))}</p>
                  <p className="whitespace-pre-wrap text-ink">« {conflict.fact} »</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void keepMine()} className="rounded-button bg-brand-fill px-3 py-1.5 font-medium text-white hover:bg-brand-fill-strong">
                      {labels.factKeepMine}
                    </button>
                    <button type="button" onClick={stopEdit} className="rounded-button px-3 py-1.5 font-medium text-ink hover:bg-active">
                      {labels.factTakeSaved}
                    </button>
                  </div>
                </div>
              )}
              <p className="flex flex-wrap items-center gap-x-2 pl-3 text-meta text-ink-3">
                <span>{stampOf(fact)}</span>
                {fact.via === "donna" && <span className="rounded-badge bg-peche-100 px-1.5 py-0.5 font-medium text-brand-strong">{labels.factByDonna}</span>}
                {fact.in_context === false && <span title={labels.factOutOfContextHint} className="rounded-badge bg-fill px-1.5 py-0.5 font-medium text-ink-2">{labels.factOutOfContext}</span>}
                {fact.version > 1 && (
                  <button type="button" onClick={() => void openHistory(fact.id)} aria-pressed={history?.scope === fact.id} className="underline-offset-2 hover:text-brand hover:underline aria-pressed:text-brand">
                    {labels.factHistory}
                  </button>
                )}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        !adding && <p className="px-4 pb-4 text-secondary text-ink-3 text-pretty">{labels.memoryEmptyHint}</p>
      )}
      {history && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-label font-medium text-ink">{history.scope === "all" ? labels.memoryHistory : labels.factHistory}</h3>
            <button type="button" onClick={() => setHistory(null)} className="rounded-badge px-2 py-1 text-meta text-ink-2 hover:bg-active">
              {labels.close}
            </button>
          </div>
          {history.failed ? (
            <p className="text-meta text-danger">{labels.memoryHistoryError}</p>
          ) : history.rows === null ? (
            <p className="text-meta text-ink-3">{labels.memoryHistoryLoading}</p>
          ) : history.rows.length ? (
            <ul className="flex flex-col gap-2">
              {history.rows.map((row) => (
                <li key={`${row.fact_id}-${row.version}`} className="flex flex-col gap-0.5">
                  <span className="text-meta text-ink-3">
                    {{ create: labels.historyCreate, update: labels.historyUpdate, delete: labels.historyDelete }[row.action]} · {who(row.changed_by)}{row.via === "donna" ? ` (${labels.factByDonnaShort})` : ""} · {when(row.changed_at)}
                  </span>
                  {row.redacted || row.purged ? (
                    <span className="text-meta italic text-ink-3">{row.purged ? labels.historyPurged : labels.historyHidden}</span>
                  ) : (
                    <span className="whitespace-pre-wrap text-secondary text-ink-2 text-pretty">{row.fact}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-meta text-ink-3">{labels.memoryHistoryEmpty}</p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="px-4 pb-3 text-meta text-danger">
          {{ add: labels.factAddError, delete: labels.factDeleteError, edit: labels.factEditError, conflictDelete: labels.factConflictDeleted, gone: labels.factGone }[error]}
        </p>
      )}
    </Card>
  );
}

/* ── Partage : invitations et membres ────────────────────────────────────────── */

export function InviteForm({ labels, projectId, initialInvites }: { labels: Labels; projectId: string; initialInvites: ProjectInviteOut[] }) {
  const [invites, setInvites] = useState(initialInvites);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<InviteErrorKind | null>(null);
  // L'invitation existe mais l'email n'est pas parti : le propriétaire doit copier le lien — jamais avalé en silence.
  const [mailNotSent, setMailNotSent] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const emailId = useId();
  const roleId = useId();

  const send = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setMailNotSent(false);
    const { ok, data, status } = await api<ProjectInviteOut>(`/${projectId}/invites`, {
      method: "POST",
      body: JSON.stringify({ email: trimmed, role }),
    });
    setBusy(false);
    if (ok && data) {
      setInvites((list) => [data, ...list]);
      setEmail("");
      setMailNotSent(data.email_sent === false);
    } else setError(inviteErrorKind(status));
  };

  const revoke = async (inviteId: string) => {
    const { ok } = await api<{ revoked: boolean }>(`/${projectId}/invites/${encodeURIComponent(inviteId)}`, { method: "DELETE" });
    if (ok) setInvites((list) => list.filter((i) => i.id !== inviteId));
  };

  const copyLink = async (invite: ProjectInviteOut, kind: "project" | "space" = "project") => {
    const token = kind === "space" ? invite.space_invite_token : invite.token;
    if (!token) return;
    try {
      await navigator.clipboard.writeText(kind === "space" ? spaceInviteLink(window.location.origin, token) : projectInviteLink(window.location.origin, token));
      const marker = `${invite.id}:${kind}`;
      setCopiedId(marker);
      window.setTimeout(() => setCopiedId((id) => (id === marker ? null : id)), 2000);
    } catch {
      // Presse-papiers indisponible (permissions navigateur) : pas bloquant.
    }
  };

  return (
    <div className="border-b border-border px-5 py-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor={emailId} className="text-label font-medium text-ink">
          {labels.inviteEmailLabel}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={emailId}
            type="email"
            required
            value={email}
            placeholder={labels.inviteEmailPlaceholder}
            onChange={(e) => setEmail(e.target.value)}
            className={`h-10 min-w-0 flex-1 basis-full sm:basis-0 ${fieldClass}`}
          />
          <label htmlFor={roleId} className="sr-only">
            {labels.inviteRoleLabel}
          </label>
          <select id={roleId} value={role} onChange={(e) => setRole(e.target.value as ProjectRole)} className="h-10 flex-1 rounded-button sm:flex-none border border-border bg-surface px-2 text-label text-ink">
            <option value="editor">{labels.roleEditor}</option>
            <option value="viewer">{labels.roleViewer}</option>
          </select>
          <button type="submit" disabled={busy || !email.trim()} className={`h-10 shrink-0 ${primaryButton} py-0`}>
            {busy ? labels.inviteSending : labels.invite}
          </button>
        </div>
        <p className="text-meta text-ink-3 text-pretty">{labels.inviteSpaceHint}</p>
        {error && (
          <p role="alert" className="text-secondary text-danger text-pretty">
            {(labels.inviteErrors as Record<string, string>)[error] ?? labels.inviteSendError}
          </p>
        )}
        {mailNotSent && (
          <p role="status" className="text-secondary text-attention text-pretty">
            {labels.inviteMailNotSent}
          </p>
        )}
      </form>

      {invites.length > 0 && (
        <div className="mt-4">
          <p className="text-meta font-medium text-ink-3">{labels.invitesPending}</p>
          <ul className="mt-1.5 flex flex-col">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-2 py-1.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-ink-3">
                  <UsersIcon size={14} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-label text-ink">{invite.email}</span>
                  <span className="text-meta text-ink-3">
                    {roleLabel(labels, invite.role)}, {labels.inviteExpiresAt.toLowerCase()} {new Date(invite.expires_at).toLocaleDateString()}
                  </span>
                  <span className={`text-meta ${spaceStatusKey(invite.space_status) === "member" ? "text-success-ink" : "text-attention"}`}>
                    {(labels.inviteSpaceStatus as Record<string, string>)[spaceStatusKey(invite.space_status)]}
                  </span>
                </span>
                {invite.token && (
                  <button type="button" onClick={() => void copyLink(invite)} className="rounded-badge px-2 py-1 text-meta font-medium text-brand hover:bg-active">
                    {copiedId === `${invite.id}:project` ? labels.inviteLinkCopied : labels.inviteCopyLink}
                  </button>
                )}
                {invite.space_invite_token && (
                  <button type="button" onClick={() => void copyLink(invite, "space")} className="rounded-badge px-2 py-1 text-meta font-medium text-brand hover:bg-active">
                    {copiedId === `${invite.id}:space` ? labels.inviteLinkCopied : labels.inviteCopySpaceLink}
                  </button>
                )}
                <button type="button" onClick={() => void revoke(invite.id)} className="rounded-badge px-2 py-1 text-meta font-medium text-ink-3 hover:bg-danger/[0.06] hover:text-danger">
                  {labels.inviteRevoke}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MembersList({
  labels,
  projectId,
  isOwner,
  currentUserId,
  members,
  setMembers,
  onLeave,
}: {
  labels: Labels;
  projectId: string;
  isOwner: boolean;
  currentUserId: string;
  members: ProjectMemberOut[];
  setMembers: (update: (list: ProjectMemberOut[]) => ProjectMemberOut[]) => void;
  onLeave: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changeRole = async (userId: string, role: ProjectRole) => {
    setBusyId(userId);
    setError(null);
    const { ok, data } = await api<ProjectMemberOut>(`/${projectId}/members/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    setBusyId(null);
    // La réponse du PATCH ne porte pas l'email : on garde celui déjà connu.
    if (ok && data) setMembers((list) => list.map((m) => (m.user_id === userId ? { ...m, role: data.role } : m)));
    else setError(labels.lastOwnerError);
  };

  const removeMember = async (userId: string) => {
    setBusyId(userId);
    setError(null);
    const { ok } = await api<{ removed: boolean }>(`/${projectId}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
    setBusyId(null);
    if (!ok) return setError(userId === currentUserId ? labels.removeMemberError : labels.lastOwnerError);
    if (userId === currentUserId) return onLeave();
    setMembers((list) => list.filter((m) => m.user_id !== userId));
  };

  return (
    <div className="px-5 py-4">
      <p className="text-meta font-medium text-ink-3">
        {labels.membersTitle} <span className="tabular-nums">{members.length}</span>
      </p>
      {error && <p className="mt-2 text-secondary text-danger">{error}</p>}
      <ul className="mt-1.5 flex flex-col">
        {members.map((member) => {
          const self = member.user_id === currentUserId;
          return (
            <li key={member.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-peche-100 text-meta font-medium text-brand-strong">{initialsOf(member)}</span>
              <span className="flex min-w-[11rem] flex-1 flex-col">
                <span className="truncate text-label text-ink" title={member.email ?? member.user_id}>
                  {member.email ?? labels.memberUnknown}
                  {self && <span className="text-ink-3"> ({labels.you})</span>}
                </span>
                {!isOwner && <span className="text-meta text-ink-3">{roleLabel(labels, member.role)}</span>}
              </span>
              {isOwner && (
                <select
                  value={member.role}
                  disabled={busyId === member.user_id}
                  aria-label={`${labels.inviteRoleLabel} : ${member.email ?? labels.memberUnknown}`}
                  onChange={(e) => void changeRole(member.user_id, e.target.value as ProjectRole)}
                  className="rounded-badge border border-border bg-surface px-2 py-1.5 text-meta text-ink"
                >
                  <option value="owner">{labels.roleOwner}</option>
                  <option value="editor">{labels.roleEditor}</option>
                  <option value="viewer">{labels.roleViewer}</option>
                </select>
              )}
              {(isOwner || self) && (
                <button
                  type="button"
                  disabled={busyId === member.user_id}
                  onClick={() => void removeMember(member.user_id)}
                  className="rounded-badge px-2 py-1.5 text-meta font-medium text-ink-3 hover:bg-danger/[0.06] hover:text-danger disabled:opacity-60"
                >
                  {self ? labels.leaveProject : labels.removeMember}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DeleteDialog({ labels, open, projectId, name, onClose, onDeleted }: { labels: Labels; open: boolean; projectId: string; name: string; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(false);
    const { ok } = await api<{ deleted: boolean }>(`/${projectId}`, { method: "DELETE" });
    setBusy(false);
    if (ok) onDeleted();
    else setError(true);
  };

  return (
    <Dialog open={open} onClose={onClose} label={labels.deleteProject} className="max-w-[26rem]">
      <div className="p-5">
        <span className="flex size-10 items-center justify-center rounded-full bg-danger/[0.08] text-danger">
          <TrashIcon size={18} />
        </span>
        <h2 className="mt-4 text-panel-title font-medium text-ink">{labels.deleteTitle.replace("{name}", name)}</h2>
        <p className="mt-1.5 text-secondary text-ink-2 text-pretty">{labels.deleteProjectConfirm}</p>
        {error && <p className="mt-3 text-secondary text-danger">{labels.deleteError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ghostButton}>
            {labels.cancel}
          </button>
          <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-button bg-danger-fill px-3.5 py-2 text-label font-medium text-white disabled:opacity-60">
            {labels.deleteProject}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
