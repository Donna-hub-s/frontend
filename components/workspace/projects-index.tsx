"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { parseBackendDate, type ProjectOut } from "@/lib/workspace-types";
import { ChevronIcon, PlusIcon, SearchIcon } from "./icons";
import { NewProjectDialog } from "./project-list";
import { ProjectIcon } from "./project-icon";
import { useWorkspace } from "./workspace-provider";

type Labels = Dictionary["workspace"]["projects"];
type Filter = "all" | "owned" | "active";

/** Un projet touché il y a moins de 14 jours compte comme « actif » — pure
 * heuristique d'affichage côté client, aucune notion de statut en base. */
const ACTIVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const isActive = (project: ProjectOut) => {
  const at = parseBackendDate(project.updated_at);
  return at !== null && Date.now() - at < ACTIVE_WINDOW_MS;
};

export function ProjectsIndex({ lang, labels }: { lang: Locale; labels: Labels }) {
  const { projects } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const searchId = useId();

  const counts = useMemo(
    () => ({
      all: projects.length,
      owned: projects.filter((p) => p.my_role === "owner").length,
      active: projects.filter(isActive).length,
    }),
    [projects],
  );

  const totalDocuments = useMemo(() => projects.reduce((n, p) => n + p.document_count, 0), [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(lang);
    return projects
      .filter((p) => filter === "all" || (filter === "owned" ? p.my_role === "owner" : isActive(p)))
      .filter((p) => !q || p.name.toLocaleLowerCase(lang).includes(q));
  }, [projects, filter, query, lang]);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: labels.filterAll, count: counts.all },
    { key: "owned", label: labels.filterOwned, count: counts.owned },
    { key: "active", label: labels.filterActive, count: counts.active },
  ];

  return (
    <div className="scrollbar-none flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[68rem] flex-col gap-6 px-4 py-8 md:px-8">
        <nav className="flex items-center gap-1.5 text-label text-ink-3">
          <Link href={`/${lang}/app`} className="no-underline hover:text-ink">
            {labels.homeLabel}
          </Link>
          <ChevronIcon size={12} className="-rotate-90" />
          <span className="font-medium text-ink-2">{labels.indexTitle}</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-hero-sm font-medium text-ink">{labels.indexTitle}</h1>
            {projects.length > 0 && (
              <p className="text-secondary text-ink-3">
                {labels.totalFiles.replace("{n}", String(totalDocuments))}
              </p>
            )}
          </div>
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              {labels.searchPlaceholder}
            </label>
            <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
              className="h-10 w-64 rounded-button border border-border bg-surface pr-3 pl-9 text-message text-ink placeholder:text-ink-3 focus:border-bordeaux-700 focus:shadow-focus focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_14rem]">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <li>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-panel border-2 border-dashed border-border bg-fill/40 p-6 text-center transition-colors hover:border-bordeaux-700/30 hover:bg-fill/70"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-peche-100 text-bordeaux-700">
                  <PlusIcon size={18} />
                </span>
                <span className="text-label font-medium text-ink">{labels.newProjectCard}</span>
                <span className="text-meta text-ink-3">{labels.newProjectCardHint}</span>
              </button>
            </li>

            {visible.map((project) => {
              const at = parseBackendDate(project.updated_at);
              return (
                <li key={project.id}>
                  <Link
                    href={`/${lang}/app/projects/${project.id}`}
                    className="flex h-full flex-col gap-2 rounded-panel bg-surface p-4 no-underline shadow-card transition-colors hover:bg-surface"
                  >
                    <span className="flex items-center gap-2 text-label font-medium text-ink">
                      <ProjectIcon icon={project.icon} size={17} className="text-bordeaux-700" />
                      <span className="truncate">{project.name}</span>
                    </span>
                    <span className="line-clamp-2 flex-1 text-secondary text-ink-2 text-pretty">
                      {project.description || labels.noDescription}
                    </span>
                    <span className="flex items-center justify-between border-t border-border pt-2 text-meta text-ink-3">
                      <span>{labels.membersCount.replace("{n}", String(project.member_count))}</span>
                      {at && (
                        <time suppressHydrationWarning>{new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(at)}</time>
                      )}
                    </span>
                    {project.context_chunks_limit > 0 && (
                      <span
                        className={`text-meta ${
                          project.context_chunks_used >= project.context_chunks_limit ? "font-medium text-danger" : "text-ink-3"
                        }`}
                      >
                        {labels.contextCapacity
                          .replace("{used}", String(project.context_chunks_used))
                          .replace("{limit}", String(project.context_chunks_limit))}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}

            {!visible.length && projects.length > 0 && (
              <li className="sm:col-span-2 xl:col-span-3">
                <p className="rounded-panel bg-surface px-5 py-8 text-center text-message text-ink-3 shadow-card">{labels.searchNone}</p>
              </li>
            )}
          </ul>

          <aside className="flex flex-col gap-1">
            <p className="px-2.5 pb-1 text-caps font-medium text-ink-3 uppercase">{labels.filterSectionTitle}</p>
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                aria-pressed={filter === item.key}
                className={`flex items-center justify-between rounded-nav px-2.5 py-2 text-left text-label transition-colors ${
                  filter === item.key ? "bg-active font-medium text-ink" : "text-ink-2 hover:bg-active/70 hover:text-ink"
                }`}
              >
                {item.label}
                <span className="text-meta text-ink-3">{item.count}</span>
              </button>
            ))}
          </aside>
        </div>
      </div>

      {creating && <NewProjectDialog lang={lang} labels={labels} onClose={() => setCreating(false)} />}
    </div>
  );
}
