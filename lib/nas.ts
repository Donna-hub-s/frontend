// Connecteur NAS : dossiers du NAS liés à un projet, indexés dans son RAG puis tenus à jour (voir
// backend/app/chat/src/nas_sync.py et routes/nas_routes.py). Le navigateur ne voit jamais un chemin du serveur : il
// manipule une ÉTIQUETTE de racine et un chemin relatif ; toute la sécurité (confinement, droits) est côté serveur.

export type NasStatus = {
  enabled: boolean;
  can_manage: boolean;
  roots: string[];
  sync_interval_min: number;
};

export type NasLinkStatus = "idle" | "running" | "done" | "capacity_reached" | "unavailable" | "review" | "failed" | "interrupted" | string;

export type NasLink = {
  id: string;
  project_id: string;
  root: string;
  path: string;
  auto_sync: boolean;
  status: NasLinkStatus;
  last_sync_at: string | null;
  last_message: string | null;
  files_total: number;
  files_indexed: number;
  files_failed: number;
  files_skipped: number;
  created_at: string;
};

/** Liaison d'un dossier du NAS proposée par DONNA (action « nas_link ») : ce que l'utilisateur approuve, tel que le serveur l'a vérifié. */
export type NasLinkDraft = {
  location: string;
  project_id: string;
  project_name: string;
  auto_sync: boolean;
  lines: string[];
};

export type NasBrowse = { root: string; path: string; directories: string[]; truncated: boolean };

export const POLL_MS = 2000;

const projectBase = (projectId: string) => `/api/donna/chat/projects/${encodeURIComponent(projectId)}/nas`;
const linkUrl = (projectId: string, linkId: string) => `${projectBase(projectId)}/${encodeURIComponent(linkId)}`;

type Result<T> = { ok: boolean; status: number; data: T | null };

async function call<T>(url: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
    const data = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export const fetchNasStatus = () => call<NasStatus>("/api/donna/chat/nas/status");

export const fetchNasLinks = (projectId: string) => call<NasLink[]>(projectBase(projectId));

export const browseNas = (root: string, path: string) =>
  call<NasBrowse>(`/api/donna/chat/nas/browse?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`);

export const createNasLink = (projectId: string, root: string, path: string, autoSync: boolean) =>
  call<NasLink>(projectBase(projectId), { method: "POST", body: JSON.stringify({ root, path, auto_sync: autoSync }) });

export const syncNasLink = (projectId: string, linkId: string) => call<NasLink>(`${linkUrl(projectId, linkId)}/sync`, { method: "POST" });

export const setNasAutoSync = (projectId: string, linkId: string, autoSync: boolean) =>
  call<NasLink>(linkUrl(projectId, linkId), { method: "PATCH", body: JSON.stringify({ auto_sync: autoSync }) });

export const unlinkNas = (projectId: string, linkId: string, removeDocuments: boolean) =>
  call<{ deleted: boolean; documents_removed: number }>(`${linkUrl(projectId, linkId)}?remove_documents=${removeDocuments}`, { method: "DELETE" });

/** Une passe est en cours : il faut continuer à relire l'état. */
export const isRunning = (status: string): boolean => status === "running";

/** Statuts où la remarque du serveur est un problème à voir, pas une simple information. */
export const needsAttention = (status: string): boolean => status === "unavailable" || status === "review" || status === "failed" || status === "interrupted";

/** Liens qui viennent de finir une passe (en cours avant, plus maintenant) : de quoi rafraîchir la liste des documents. */
export function justFinished(before: NasLink[], after: NasLink[]): boolean {
  const was = new Set(before.filter((l) => isRunning(l.status)).map((l) => l.id));
  return after.some((l) => was.has(l.id) && !isRunning(l.status));
}

/** Chemin relatif d'un sous-dossier : « Contrats » + « 2025 » → « Contrats/2025 ». */
export const joinPath = (parent: string, name: string): string => (parent ? `${parent}/${name}` : name);

/** Chemin du dossier parent ("" = la racine). */
export const parentPath = (path: string): string => path.split("/").filter(Boolean).slice(0, -1).join("/");

/** Fil d'Ariane : un élément par niveau, avec le chemin qui y mène. */
export function crumbs(path: string): { name: string; path: string }[] {
  const parts = path.split("/").filter(Boolean);
  return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join("/") }));
}

/** « nas » ou « nas / Contrats/2025 » — la racine seule quand le dossier lié est la racine. */
export const locationLabel = (root: string, path: string): string => (path ? `${root} / ${path}` : root);
