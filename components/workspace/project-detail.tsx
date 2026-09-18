"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type {
  ConversationOut,
  MentionSelection,
  ProjectDocumentOut,
  ProjectFactOut,
  ProjectInviteOut,
  ProjectMemberOut,
  ProjectOut,
  ProjectRole,
} from "@/lib/workspace-types";
import { parseBackendDate } from "@/lib/workspace-types";
import { Composer } from "./conversation";
import { ChatIcon, ChevronIcon, FileIcon, LockIcon, MailIcon, PencilIcon, TrashIcon, UploadIcon, UsersIcon } from "./icons";
import { useWorkspace } from "./workspace-provider";

type WorkspaceDict = Dictionary["workspace"];
type Labels = WorkspaceDict["projects"];

const roleLabel = (labels: Labels, role: ProjectRole | string) =>
  role === "owner" ? labels.roleOwner : role === "editor" ? labels.roleEditor : labels.roleViewer;

const fieldClass =
  "w-full rounded-button border border-border bg-white px-3 text-message text-ink placeholder:text-ink-3 focus:border-bordeaux-700 focus:shadow-focus focus:outline-none";

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
async function uploadDocument(projectId: string, file: File): Promise<{ ok: boolean; data: ProjectDocumentOut | null }> {
  try {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/api/donna/chat/projects/${encodeURIComponent(projectId)}/documents`, {
      method: "POST",
      body: form,
    });
    const data = (await response.json().catch(() => null)) as ProjectDocumentOut | null;
    return { ok: response.ok, data };
  } catch {
    return { ok: false, data: null };
  }
}

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
  const { projects, upsertProject, removeProject } = useWorkspace();
  const router = useRouter();
  const isOwner = project.my_role === "owner";
  // Reflète les mises à jour de capacité poussées en temps réel (voir
  // use-project-ws.ts) — `project` reste la donnée initiale du serveur,
  // `liveProject` la version tenue à jour par WorkspaceProvider.
  const liveProject = projects.find((p) => p.id === project.id) ?? project;

  return (
    <div className="scrollbar-none flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[64rem] flex-col gap-8 px-4 py-8 md:px-8">
        <nav className="flex items-center gap-1.5 text-label text-ink-3">
          <Link href={`/${lang}/app/projects`} className="no-underline hover:text-ink">
            {labels.indexTitle}
          </Link>
          <ChevronIcon size={12} className="-rotate-90" />
          <span className="font-medium text-ink-2">{project.name}</span>
        </nav>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <ProjectHeader labels={labels} project={project} isOwner={isOwner} onSaved={upsertProject} />
            <InlineComposer lang={lang} dict={dict} projectId={project.id} />
            <DocumentsSection
              labels={labels}
              projectId={project.id}
              initialDocuments={initialDocuments}
              canEdit={project.my_role !== "viewer"}
              contextChunksUsed={liveProject.context_chunks_used}
              contextChunksLimit={liveProject.context_chunks_limit}
            />
            <RecentConversations lang={lang} labels={labels} conversations={initialConversations} />
          </div>

          <div className="flex flex-col gap-6">
            <InstructionsCard labels={labels} project={project} isOwner={isOwner} onSaved={upsertProject} />
            <MemorySection labels={labels} projectId={project.id} initialFacts={initialFacts} canEdit={project.my_role !== "viewer"} />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <MembersSection
            labels={labels}
            projectId={project.id}
            isOwner={isOwner}
            currentUserId={currentUserId}
            initialMembers={initialMembers}
            onLeave={() => {
              removeProject(project.id);
              router.push(`/${lang}/app`);
            }}
          />

          {isOwner && <InvitesSection labels={labels} projectId={project.id} initialInvites={initialInvites} />}

          {isOwner && (
            <DangerZone
              labels={labels}
              projectId={project.id}
              onDeleted={() => {
                removeProject(project.id);
                router.push(`/${lang}/app`);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectHeader({
  labels,
  project,
  isOwner,
  onSaved,
}: {
  labels: Labels;
  project: ProjectOut;
  isOwner: boolean;
  onSaved: (project: ProjectOut) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const nameId = useId();
  const descId = useId();

  const startEdit = () => {
    setName(project.name);
    setDescription(project.description ?? "");
    setError(false);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    setError(false);
    const { ok, data } = await api<ProjectOut>(`/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
    });
    setBusy(false);
    if (ok && data) {
      onSaved(data);
      setEditing(false);
    } else {
      setError(true);
    }
  };

  if (editing) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor={nameId} className="sr-only">
          {labels.nameLabel}
        </label>
        <input
          id={nameId}
          autoFocus
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`h-11 text-hero-sm font-medium ${fieldClass}`}
        />
        <label htmlFor={descId} className="sr-only">
          {labels.descriptionLabel}
        </label>
        <textarea
          id={descId}
          rows={2}
          value={description}
          placeholder={labels.descriptionLabel}
          onChange={(event) => setDescription(event.target.value)}
          className={`resize-none py-2 ${fieldClass}`}
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-button bg-bordeaux-700 px-3.5 py-2 text-label font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60"
          >
            {busy ? labels.saving : labels.save}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-button px-3.5 py-2 text-label font-medium text-ink hover:bg-active">
            {labels.cancel}
          </button>
          {error && <span className="text-secondary text-danger">{labels.saveError}</span>}
        </div>
      </form>
    );
  }

  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h1 className="text-hero-sm font-medium text-ink">{project.name}</h1>
        {isOwner && (
          <button
            type="button"
            onClick={startEdit}
            aria-label={labels.edit}
            title={labels.edit}
            className="rounded-button p-1.5 text-ink-3 hover:bg-active hover:text-bordeaux-700"
          >
            <PencilIcon size={16} />
          </button>
        )}
      </div>
      <p className="max-w-2xl text-message text-ink-2 text-pretty">{project.description || labels.noDescription}</p>
    </header>
  );
}

/** Même Composer que le chat (pièce jointe, recherche web, auto-agrandissement) —
 * plus convivial que l'ancien champ minimal. Envoyer ici dépose le brouillon
 * dans WorkspaceProvider (voir conversation.tsx) puis amène sur /app pour
 * voir la réponse : on ne duplique pas la boucle de streaming ici. */
function InlineComposer({ lang, dict, projectId }: { lang: Locale; dict: WorkspaceDict; projectId: string }) {
  const { setProjectDraft } = useWorkspace();
  const router = useRouter();

  const handleSend = async (text: string, files: File[], webSearch: boolean, mentions: MentionSelection) => {
    setProjectDraft({ message: text, files, webSearch, mentions });
    router.push(`/${lang}/app?project=${projectId}`);
  };

  return <Composer dict={dict} busy={false} onSend={handleSend} onStop={() => {}} autoFocus={false} />;
}

function DocumentsSection({
  labels,
  projectId,
  initialDocuments,
  canEdit,
  contextChunksUsed,
  contextChunksLimit,
}: {
  labels: Labels;
  projectId: string;
  initialDocuments: ProjectDocumentOut[];
  canEdit: boolean;
  contextChunksUsed: number;
  contextChunksLimit: number;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<"upload" | "delete" | "capacity" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Le blocage réel est appliqué côté serveur (400) — ce garde-fou côté
  // client évite juste une requête vouée à l'échec quand la limite est
  // visiblement déjà atteinte.
  const atCapacity = contextChunksLimit > 0 && contextChunksUsed >= contextChunksLimit;

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    if (atCapacity) {
      setError("capacity");
      return;
    }
    setError(null);
    for (const file of list) {
      const { ok, data } = await uploadDocument(projectId, file);
      if (ok && data) setDocuments((docs) => [data, ...docs]);
      else setError("upload");
    }
  };

  const remove = async (id: string) => {
    const { ok } = await api<{ deleted: boolean }>(`/${projectId}/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (ok) setDocuments((docs) => docs.filter((d) => d.id !== id));
    else setError("delete");
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-caps font-medium text-ink-3 uppercase">{labels.documentsTitle}</h2>
        {contextChunksLimit > 0 && (
          <span
            className={`text-meta ${atCapacity ? "font-medium text-danger" : "text-ink-3"}`}
          >
            {labels.contextCapacity.replace("{used}", String(contextChunksUsed)).replace("{limit}", String(contextChunksLimit))}
          </span>
        )}
      </div>

      {canEdit && (atCapacity ? (
        <p className="rounded-panel border-2 border-dashed border-border bg-fill/40 px-6 py-8 text-center text-secondary text-ink-3">
          {labels.contextCapacityReached}
        </p>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void uploadFiles(event.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") fileRef.current?.click();
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-panel border-2 border-dashed px-6 py-8 text-center transition-colors ${
            dragging ? "border-bordeaux-700/50 bg-peche-100/30" : "border-border bg-fill/40 hover:border-bordeaux-700/30"
          }`}
        >
          <UploadIcon size={22} className="text-ink-3" />
          <p className="text-label font-medium text-ink">{labels.dropzoneHint}</p>
          <p className="text-meta text-ink-3">{labels.dropzoneTypes}</p>
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
        </div>
      ))}
      {error === "upload" && <p className="text-secondary text-danger">{labels.uploadError}</p>}
      {error === "delete" && <p className="text-secondary text-danger">{labels.deleteDocumentError}</p>}
      {error === "capacity" && <p className="text-secondary text-danger">{labels.contextCapacityReached}</p>}

      {!documents.length ? (
        <p className="text-secondary text-ink-3">{labels.documentsEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-panel bg-surface shadow-card">
          {documents.map((doc) => (
            <li key={doc.id} className="group flex items-center gap-3 px-4 py-3">
              <FileIcon size={16} className="shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 truncate text-label text-ink">{doc.original_name}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void remove(doc.id)}
                  className="shrink-0 text-meta font-medium text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100"
                >
                  {labels.deleteDocument}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentConversations({ lang, labels, conversations }: { lang: Locale; labels: Labels; conversations: ConversationOut[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ChatIcon size={14} className="text-ink-3" />
        <h2 className="text-caps font-medium text-ink-3 uppercase">{labels.recentTitle}</h2>
      </div>
      {!conversations.length ? (
        <p className="text-secondary text-ink-3">{labels.recentEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {conversations.map((conversation) => {
            const at = parseBackendDate(conversation.updated_at ?? conversation.created_at);
            return (
              <li key={conversation.id}>
                <Link
                  href={`/${lang}/app/c/${conversation.id}`}
                  className="group -mx-2 flex items-center justify-between gap-3 rounded-nav px-2 py-3.5 text-label text-ink no-underline hover:bg-active/50"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ChatIcon size={16} className="shrink-0 text-ink-3" />
                    <span className="truncate font-medium group-hover:text-bordeaux-700">{conversation.title}</span>
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

function InstructionsCard({
  labels,
  project,
  isOwner,
  onSaved,
}: {
  labels: Labels;
  project: ProjectOut;
  isOwner: boolean;
  onSaved: (project: ProjectOut) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.instructions ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const fieldId = useId();

  const startEdit = () => {
    setValue(project.instructions ?? "");
    setError(false);
    setEditing(true);
  };

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
    } else {
      setError(true);
    }
  };

  return (
    <section className="rounded-panel bg-surface shadow-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-caps font-medium text-ink">{labels.instructionsTitle}</h2>
        {isOwner && !editing && (
          <button type="button" onClick={startEdit} aria-label={labels.edit} title={labels.edit} className="text-ink-3 hover:text-bordeaux-700">
            <PencilIcon size={14} />
          </button>
        )}
      </header>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="flex flex-col gap-2 p-4"
        >
          <label htmlFor={fieldId} className="sr-only">
            {labels.instructionsTitle}
          </label>
          <textarea id={fieldId} rows={4} value={value} onChange={(event) => setValue(event.target.value)} className={`resize-none py-2 ${fieldClass}`} />
          <p className="text-meta text-ink-3">{labels.instructionsHint}</p>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-button bg-bordeaux-700 px-3 py-1.5 text-meta font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60"
            >
              {busy ? labels.saving : labels.save}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-button px-3 py-1.5 text-meta font-medium text-ink hover:bg-active">
              {labels.cancel}
            </button>
            {error && <span className="text-meta text-danger">{labels.saveError}</span>}
          </div>
        </form>
      ) : (
        <div className="p-4">
          <p className="text-secondary text-ink-2 text-pretty leading-relaxed">{project.instructions || labels.instructionsEmpty}</p>
        </div>
      )}
    </section>
  );
}

function MemorySection({
  labels,
  projectId,
  initialFacts,
  canEdit,
}: {
  labels: Labels;
  projectId: string;
  initialFacts: ProjectFactOut[];
  canEdit: boolean;
}) {
  const [facts, setFacts] = useState(initialFacts);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"add" | "delete" | null>(null);
  const factId = useId();

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
    } else {
      setError("add");
    }
  };

  const remove = async (id: string) => {
    const { ok } = await api<{ deleted: boolean }>(`/${projectId}/memory/facts/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (ok) setFacts((list) => list.filter((f) => f.id !== id));
    else setError("delete");
  };

  return (
    <section className="rounded-panel bg-surface shadow-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-caps font-medium text-ink">{labels.memoryTitle}</h2>
        <span className="flex items-center gap-1 rounded-badge bg-fill px-1.5 py-0.5 text-meta font-medium text-ink-3">
          <LockIcon size={11} />
          {labels.memoryPrivate}
        </span>
      </header>

      {!facts.length ? (
        <p className="px-4 py-4 text-secondary text-ink-3">{labels.memoryEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {facts.map((fact) => (
            <li key={fact.id} className="group flex items-start gap-3 p-4">
              <span className="flex-1 text-secondary text-ink-2 leading-tight text-pretty">{fact.fact}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void remove(fact.id)}
                  className="shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100"
                >
                  {labels.factDelete}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error === "delete" && <p className="px-4 pb-3 text-secondary text-danger">{labels.factDeleteError}</p>}

      {canEdit && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <label htmlFor={factId} className="sr-only">
            {labels.factPlaceholder}
          </label>
          <input
            id={factId}
            value={value}
            placeholder={labels.factPlaceholder}
            onChange={(event) => setValue(event.target.value)}
            className={`h-9 text-secondary ${fieldClass}`}
          />
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="h-9 shrink-0 rounded-button bg-bordeaux-700 px-3 text-meta font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60"
          >
            {busy ? labels.factAdding : labels.factAdd}
          </button>
        </form>
      )}
      {error === "add" && <p className="px-4 pb-3 text-secondary text-danger">{labels.factAddError}</p>}
    </section>
  );
}

function MembersSection({
  labels,
  projectId,
  isOwner,
  currentUserId,
  initialMembers,
  onLeave,
}: {
  labels: Labels;
  projectId: string;
  isOwner: boolean;
  currentUserId: string;
  initialMembers: ProjectMemberOut[];
  onLeave: () => void;
}) {
  const [members, setMembers] = useState(initialMembers);
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
    if (ok && data) setMembers((list) => list.map((m) => (m.user_id === userId ? data : m)));
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
    <section className="rounded-panel bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <UsersIcon size={17} className="text-ink-3" />
        <h2 className="text-panel-title font-medium text-ink">{labels.membersTitle}</h2>
      </header>
      {error && <p className="px-5 pt-3 text-secondary text-danger">{error}</p>}
      {!members.length ? (
        <p className="px-5 py-4 text-secondary text-ink-3">{labels.membersEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {members.map((member) => {
            const self = member.user_id === currentUserId;
            const canManage = isOwner || self;
            return (
              <li key={member.user_id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 truncate text-label text-ink" title={member.user_id}>
                  {member.user_id}
                  {self && <span className="text-ink-3"> · {labels.you}</span>}
                </span>
                {isOwner ? (
                  <select
                    value={member.role}
                    disabled={busyId === member.user_id}
                    onChange={(event) => void changeRole(member.user_id, event.target.value as ProjectRole)}
                    className="rounded-badge border border-border bg-white px-2 py-1.5 text-meta text-ink"
                  >
                    <option value="owner">{labels.roleOwner}</option>
                    <option value="editor">{labels.roleEditor}</option>
                    <option value="viewer">{labels.roleViewer}</option>
                  </select>
                ) : (
                  <span className="text-meta text-ink-3">{roleLabel(labels, member.role)}</span>
                )}
                {canManage && (
                  <button
                    type="button"
                    disabled={busyId === member.user_id}
                    onClick={() => void removeMember(member.user_id)}
                    className="rounded-badge px-2.5 py-1.5 text-meta font-medium text-danger hover:bg-danger/[0.06] disabled:opacity-60"
                  >
                    {self ? labels.leaveProject : labels.removeMember}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function InvitesSection({ labels, projectId, initialInvites }: { labels: Labels; projectId: string; initialInvites: ProjectInviteOut[] }) {
  const [invites, setInvites] = useState(initialInvites);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const emailId = useId();

  const send = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(false);
    const { ok, data } = await api<ProjectInviteOut>(`/${projectId}/invites`, {
      method: "POST",
      body: JSON.stringify({ email: trimmed, role }),
    });
    setBusy(false);
    if (ok && data) {
      setInvites((list) => [data, ...list]);
      setEmail("");
    } else {
      setError(true);
    }
  };

  const revoke = async (inviteId: string) => {
    const { ok } = await api<{ revoked: boolean }>(`/${projectId}/invites/${encodeURIComponent(inviteId)}`, { method: "DELETE" });
    if (ok) setInvites((list) => list.filter((i) => i.id !== inviteId));
  };

  const copyLink = async (invite: ProjectInviteOut) => {
    if (!invite.token) return;
    const url = `${window.location.origin}/projects/invites/${invite.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(invite.id);
      window.setTimeout(() => setCopiedId((id) => (id === invite.id ? null : id)), 2000);
    } catch {
      // Presse-papiers indisponible (permissions navigateur) : rien d'affiché, pas bloquant.
    }
  };

  return (
    <section className="rounded-panel bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <MailIcon size={17} className="text-ink-3" />
        <h2 className="text-panel-title font-medium text-ink">{labels.invitesTitle}</h2>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex flex-wrap items-end gap-2 border-b border-border px-5 py-4"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={emailId} className="text-label font-medium text-ink">
            {labels.inviteEmailLabel}
          </label>
          <input
            id={emailId}
            type="email"
            required
            value={email}
            placeholder={labels.inviteEmailPlaceholder}
            onChange={(event) => setEmail(event.target.value)}
            className={`h-10 ${fieldClass}`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-label font-medium text-ink">{labels.inviteRoleLabel}</label>
          <select value={role} onChange={(event) => setRole(event.target.value as ProjectRole)} className="h-10 rounded-button border border-border bg-white px-2.5 text-message text-ink">
            <option value="editor">{labels.roleEditor}</option>
            <option value="viewer">{labels.roleViewer}</option>
            <option value="owner">{labels.roleOwner}</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="h-10 rounded-button bg-bordeaux-700 px-3.5 text-label font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60"
        >
          {busy ? labels.inviteSending : labels.inviteSend}
        </button>
        {error && <p className="w-full text-secondary text-danger">{labels.inviteSendError}</p>}
      </form>

      {!invites.length ? (
        <p className="px-5 py-4 text-secondary text-ink-3">{labels.invitesEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
              <span className="min-w-0 flex-1 truncate text-label text-ink">{invite.email}</span>
              <span className="text-meta text-ink-3">{roleLabel(labels, invite.role)}</span>
              <span className="text-meta text-ink-3">
                {labels.inviteExpiresAt} {new Date(invite.expires_at).toLocaleDateString()}
              </span>
              {invite.token && (
                <button type="button" onClick={() => void copyLink(invite)} className="rounded-badge px-2.5 py-1.5 text-meta font-medium text-bordeaux-700 hover:bg-active">
                  {copiedId === invite.id ? labels.inviteLinkCopied : labels.inviteCopyLink}
                </button>
              )}
              <button type="button" onClick={() => void revoke(invite.id)} className="rounded-badge px-2.5 py-1.5 text-meta font-medium text-danger hover:bg-danger/[0.06]">
                {labels.inviteRevoke}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DangerZone({ labels, projectId, onDeleted }: { labels: Labels; projectId: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
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
    <section className="rounded-panel border border-danger/20 bg-surface p-5 shadow-card">
      <TrashIcon size={17} className="text-danger" />
      <p className="mt-2 text-label text-ink-2">{labels.deleteProjectConfirm}</p>
      {error && <p className="mt-2 text-secondary text-danger">{labels.deleteError}</p>}
      <div className="mt-3 flex gap-2">
        {confirming ? (
          <>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-button px-3.5 py-2 text-label font-medium text-ink hover:bg-active">
              {labels.cancel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="rounded-button bg-danger px-3.5 py-2 text-label font-medium text-white disabled:opacity-60"
            >
              {labels.deleteProject}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="rounded-button border border-danger/40 px-3.5 py-2 text-label font-medium text-danger hover:bg-danger/[0.06]">
            {labels.deleteProject}
          </button>
        )}
      </div>
    </section>
  );
}
