"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import { WORKSPACE_PROJECTS_URL, claimOwnershipUrl, isOrphan, type WorkspaceProject } from "@/lib/project-invites";

type Labels = Dictionary["workspace"]["projects"];

/**
 * « Projets de l'espace » — pour le responsable de l'espace seulement : qui gère chaque projet, et la reprise d'un projet resté sans
 * propriétaire. Aucune donnée de projet n'y figure. Le serveur répond 403 à qui n'est pas responsable : la section ne s'affiche alors pas.
 */
export function WorkspaceProjects({ lang, labels }: { lang: Locale; labels: Labels }) {
  const [projects, setProjects] = useState<WorkspaceProject[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = async (): Promise<WorkspaceProject[] | null> => {
    try {
      const response = await fetch(WORKSPACE_PROJECTS_URL, { cache: "no-store" });
      return response.ok ? ((await response.json()) as WorkspaceProject[]) : null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let live = true;
    void load().then((list) => {
      if (live) setProjects(list);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!projects || projects.length === 0) return null;

  const claim = async (project: WorkspaceProject) => {
    setFailed(null);
    const response = await fetch(claimOwnershipUrl(project.id), { method: "POST" }).catch(() => null);
    if (response?.ok) setProjects(await load());
    else setFailed(project.id);
  };

  return (
    <section aria-label={labels.workspaceProjectsTitle} className="rounded-panel bg-surface p-5 shadow-card">
      <h2 className="text-panel-title font-medium text-ink">{labels.workspaceProjectsTitle}</h2>
      <p className="mt-1 text-meta text-ink-3 text-pretty">{labels.workspaceProjectsHint}</p>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {projects.map((project) => (
          <li key={project.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="min-w-0 flex-1">
              {project.my_role ? (
                <Link href={`/${lang}/app/projects/${encodeURIComponent(project.id)}`} className="truncate text-label font-medium text-ink no-underline hover:underline">
                  {project.name}
                </Link>
              ) : (
                <span className="truncate text-label font-medium text-ink">{project.name}</span>
              )}
              <span className="block text-meta text-ink-3">
                {labels.membersCount.replace("{n}", String(project.member_count))}
                {" · "}
                {isOrphan(project) ? (
                  <span className="font-medium text-attention">{labels.workspaceProjectNoOwner}</span>
                ) : (
                  labels.workspaceProjectOwners.replace("{names}", project.owners.join(", ") || "—")
                )}
              </span>
            </span>
            {isOrphan(project) && (
              <button type="button" onClick={() => void claim(project)} className="rounded-button bg-brand-fill px-3 py-1.5 text-meta font-medium text-white hover:bg-brand-fill-strong">
                {labels.workspaceProjectClaim}
              </button>
            )}
            {failed === project.id && (
              <p role="alert" className="basis-full text-meta text-danger">
                {labels.workspaceProjectClaimError}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
