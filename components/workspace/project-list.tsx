"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { ProjectOut } from "@/lib/workspace-types";
import { Dialog } from "./dialog";
import { PlusIcon } from "./icons";
import { ProjectIcon, ProjectIconPicker } from "./project-icon";
import { useWorkspace } from "./workspace-provider";

type SidebarLabels = Dictionary["workspace"]["sidebar"];
type ProjectLabels = Dictionary["workspace"]["projects"];

/** Section « Projets » de la barre latérale : liste + bouton de création (voir NewProjectDialog). */
export function ProjectSidebarSection({
  lang,
  labels,
  projectLabels,
  activeId,
  onNavigate,
}: {
  lang: Locale;
  labels: SidebarLabels;
  projectLabels: ProjectLabels;
  activeId?: string;
  onNavigate: () => void;
}) {
  const { projects } = useWorkspace();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between px-2.5 pb-1.5">
        <p className="text-caps font-medium text-ink-3 uppercase">{labels.projects}</p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label={labels.newProject}
          title={labels.newProject}
          className="flex size-6 items-center justify-center rounded-badge text-ink-3 hover:bg-active hover:text-ink"
        >
          <PlusIcon size={15} />
        </button>
      </div>
      {!projects.length ? (
        <p className="px-2.5 py-1 text-secondary text-ink-3">{labels.projectsEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-px">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/${lang}/app/projects/${project.id}`}
                onClick={onNavigate}
                aria-current={project.id === activeId ? "page" : undefined}
                className={`flex h-9 items-center gap-2.5 rounded-nav px-2.5 text-label no-underline transition-colors duration-(--duration-fast) ${
                  project.id === activeId ? "bg-active font-medium text-ink" : "text-ink-2 hover:bg-active/70 hover:text-ink"
                }`}
              >
                <ProjectIcon icon={project.icon} size={16} className="text-ink-3" />
                <span className="truncate">{project.name}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={`/${lang}/app/projects`}
              onClick={onNavigate}
              className="flex h-8 items-center gap-2.5 rounded-nav px-2.5 text-meta text-ink-3 no-underline hover:bg-active/70 hover:text-ink"
            >
              {labels.viewAllProjects}
            </Link>
          </li>
        </ul>
      )}
      {creating && <NewProjectDialog lang={lang} labels={projectLabels} onClose={() => setCreating(false)} />}
    </div>
  );
}

export function NewProjectDialog({ lang, labels, onClose }: { lang: Locale; labels: ProjectLabels; onClose: () => void }) {
  const { upsertProject } = useWorkspace();
  const router = useRouter();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const nameId = useId();
  const descId = useId();
  const instrId = useId();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/donna/chat/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          icon,
          description: description.trim() || null,
          instructions: instructions.trim() || null,
        }),
      });
      if (!response.ok) throw new Error();
      const project: ProjectOut = await response.json();
      upsertProject(project);
      onClose();
      router.push(`/${lang}/app/projects/${project.id}`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  // <dialog> natif (couche supérieure) : un `fixed inset-0` rendu ici s'affichait DANS la barre latérale, parce
  // que celle-ci porte une transformation CSS (translate) qui devient le repère des éléments `fixed` qu'elle contient.
  return (
    <Dialog open onClose={onClose} label={labels.createTitle} className="max-w-[26rem]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="scrollbar-none flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-y-auto p-5"
      >
        <h2 className="text-panel-title font-medium text-ink">{labels.createTitle}</h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-label font-medium text-ink">
            {labels.nameLabel}
          </label>
          <input
            id={nameId}
            autoFocus
            required
            maxLength={120}
            value={name}
            placeholder={labels.namePlaceholder}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-full rounded-button border border-border bg-surface px-3 text-message text-ink placeholder:text-ink-3 focus:border-bordeaux-700 focus:shadow-focus focus:outline-none"
          />
        </div>

        <ProjectIconPicker value={icon} onChange={setIcon} label={labels.iconLabel} names={labels.iconNames} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={descId} className="text-label font-medium text-ink">
            {labels.descriptionLabel}
          </label>
          <textarea
            id={descId}
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full resize-none rounded-button border border-border bg-surface px-3 py-2 text-message text-ink focus:border-bordeaux-700 focus:shadow-focus focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={instrId} className="text-label font-medium text-ink">
            {labels.instructionsLabel}
          </label>
          <textarea
            id={instrId}
            rows={3}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            className="w-full resize-none rounded-button border border-border bg-surface px-3 py-2 text-message text-ink focus:border-bordeaux-700 focus:shadow-focus focus:outline-none"
          />
          <p className="text-meta text-ink-3">{labels.instructionsHint}</p>
        </div>

        {error && <p className="text-secondary text-danger">{labels.createError}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-button px-3.5 py-2 text-label font-medium text-ink hover:bg-active">
            {labels.cancel}
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-button bg-bordeaux-700 px-3.5 py-2 text-label font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60"
          >
            {busy ? labels.creating : labels.create}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
