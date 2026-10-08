// Import récursif d'un dossier Google Drive entier dans un projet : démarré par un geste de l'utilisateur
// (DrivePicker), suivi ici pendant qu'il travaille en tâche de fond (voir
// backend/app/chat/src/drive_folder_import.py et routes/project_routes.py). Même forme que lib/research.ts.

export type DriveFolderImportStep = { at: string; kind: "listed" | "imported" | "failed" | "skipped" | string; label: string };

export type DriveFolderImportRun = {
  id: string;
  project_id: string;
  folder_id: string;
  folder_name: string | null;
  status: "running" | "done" | "failed" | "cancelled" | "interrupted" | "capacity_reached" | string;
  files_found: number;
  files_imported: number;
  files_failed: number;
  files_skipped: number;
  steps: DriveFolderImportStep[];
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

const base = (projectId: string) => `/api/donna/chat/projects/${encodeURIComponent(projectId)}/documents/drive/folder`;

export const driveFolderImportRunUrl = (projectId: string, runId: string) => `${base(projectId)}/${encodeURIComponent(runId)}`;
export const driveFolderImportCancelUrl = (projectId: string, runId: string) => `${driveFolderImportRunUrl(projectId, runId)}/cancel`;

export const POLL_MS = 2000;

/** Terminé, quelle que soit l'issue : plus rien à suivre. */
export const isFinished = (status: string): boolean => status !== "running";

/** Démarre l'import ; null si refusé (quota, dossier invalide, Google non connecté — l'appelant affiche l'erreur HTTP). */
export async function startDriveFolderImport(projectId: string, folderId: string, folderName: string | null): Promise<DriveFolderImportRun | null> {
  try {
    const response = await fetch(base(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folder_id: folderId, folder_name: folderName }),
    });
    return response.ok ? ((await response.json()) as DriveFolderImportRun) : null;
  } catch {
    return null;
  }
}

/** Un `GET .../documents/drive/folder/{id}` : le run, ou null (supprimé, panne réseau) — l'appelant réessaie. */
export async function fetchDriveFolderImportRun(projectId: string, runId: string): Promise<DriveFolderImportRun | null> {
  try {
    const response = await fetch(driveFolderImportRunUrl(projectId, runId), { cache: "no-store" });
    return response.ok ? ((await response.json()) as DriveFolderImportRun) : null;
  } catch {
    return null;
  }
}

export async function cancelDriveFolderImportRun(projectId: string, runId: string): Promise<boolean> {
  try {
    return (await fetch(driveFolderImportCancelUrl(projectId, runId), { method: "POST" })).ok;
  } catch {
    return false;
  }
}

/** Dernières étapes à montrer (les plus récentes en bas), sans doublon consécutif. */
export function visibleSteps(steps: DriveFolderImportStep[], max = 6): DriveFolderImportStep[] {
  const out: DriveFolderImportStep[] = [];
  for (const step of steps) if (out[out.length - 1]?.label !== step.label) out.push(step);
  return out.slice(-max);
}
