"use client";

// Aides partagées de l'écran projet (page détaillée + formulaire d'invitation).
// Extrait de project-detail.tsx : `api()` y est appelé partout (18 fois) et
// `Labels`/`roleLabel`/styles le traversent — les isoler évite un import
// circulaire si on les laissait dans project-detail.tsx.

import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { ProjectRole } from "@/lib/workspace-types";

export type WorkspaceDict = Dictionary["workspace"];
export type Labels = WorkspaceDict["projects"];

export const roleLabel = (labels: Labels, role: ProjectRole | string) =>
  role === "owner" ? labels.roleOwner : role === "editor" ? labels.roleEditor : labels.roleViewer;

export const fieldClass =
  "w-full rounded-button border border-border bg-surface px-3 text-message text-ink placeholder:text-ink-3 focus:border-brand focus:shadow-focus focus:outline-none";
export const primaryButton = "rounded-button bg-brand-fill px-3.5 py-2 text-label font-medium text-white hover:bg-brand-fill-strong disabled:opacity-60";

export async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null; status: number }> {
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
