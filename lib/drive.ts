// Client Google Drive côté navigateur : liste/recherche, et récupération de fichiers
// pour les joindre à un message. Le jeton Google reste serveur : tout passe par
// /api/donna/chat/drive/* (backend/app/chat/src/routes/drive_routes.py).

/** backend/app/chat/src/schemas.py::DriveFileOut */
export type DriveFileOut = {
  id: string;
  name: string;
  mime_type: string;
  is_folder: boolean;
  /** Fichier que DONNA sait lire (PDF, Office, texte, image, Docs/Sheets/Slides natifs). */
  importable: boolean;
  modified_time: string | null;
  size: number | null;
};

export type DriveListOut = { files: DriveFileOut[]; next_page_token: string | null };

/** Codes d'erreur du backend (drive.py::DriveError) — l'interface choisit son message. */
export type DriveErrorCode =
  | "not_connected"
  | "scope_missing"
  | "not_found"
  | "forbidden"
  | "too_large"
  | "unsupported"
  | "folder"
  | "invalid"
  | "unavailable";

export type DriveResult<T> = { ok: true; data: T } | { ok: false; code: DriveErrorCode };

/** Dossier virtuel « Partagés avec moi » (voir backend drive.py::SHARED_WITH_ME). */
export const DRIVE_SHARED = "shared";

const base = "/api/donna/chat/drive/files";

async function errorCode(response: Response): Promise<DriveErrorCode> {
  try {
    const body = (await response.json()) as { detail?: { code?: DriveErrorCode } | string };
    if (body.detail && typeof body.detail === "object" && body.detail.code) return body.detail.code;
  } catch {
    // corps non JSON : on retombe sur le statut
  }
  if (response.status === 409) return "not_connected";
  if (response.status === 403) return "forbidden";
  return "unavailable";
}

export async function listDrive(
  params: { query?: string; folderId?: string | null; pageToken?: string | null },
  signal?: AbortSignal,
): Promise<DriveResult<DriveListOut>> {
  const search = new URLSearchParams();
  if (params.query?.trim()) search.set("q", params.query.trim());
  else if (params.folderId) search.set("folder_id", params.folderId);
  if (params.pageToken) search.set("page_token", params.pageToken);
  try {
    const response = await fetch(`${base}?${search}`, { signal, cache: "no-store" });
    if (!response.ok) return { ok: false, code: await errorCode(response) };
    return { ok: true, data: (await response.json()) as DriveListOut };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

/** Nom proposé par Content-Disposition (RFC 6266 : `filename*` UTF-8 prioritaire). */
export function fileNameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // séquence invalide : on essaie le nom simple
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

export async function downloadDriveFile(id: string, signal?: AbortSignal): Promise<DriveResult<File>> {
  try {
    const response = await fetch(`${base}/${encodeURIComponent(id)}/content`, { signal, cache: "no-store" });
    if (!response.ok) return { ok: false, code: await errorCode(response) };
    const blob = await response.blob();
    const name = fileNameFromDisposition(response.headers.get("content-disposition"), id);
    return { ok: true, data: new File([blob], name, { type: response.headers.get("content-type") ?? blob.type }) };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

/**
 * Exécute `task` sur chaque élément : le PREMIER seul, puis les suivants par lots de
 * `concurrency`. Le premier appel renouvelle au besoin la session (le refresh token du
 * navigateur est à usage unique, voir app/api/donna/[...path]/route.ts) : lancer tous les
 * téléchargements d'un coup ferait échouer ceux qui arrivent après le premier
 * renouvellement. Les résultats gardent l'ordre d'entrée.
 */
export async function runFirstThenParallel<T, R>(
  items: T[],
  task: (item: T, index: number) => Promise<R>,
  concurrency = 3,
  onDone?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let done = 0;
  const run = async (index: number) => {
    results[index] = await task(items[index], index);
    onDone?.(++done, items.length);
  };
  if (!items.length) return results;
  await run(0);
  let next = 1;
  const worker = async () => {
    while (next < items.length) await run(next++);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length - 1) }, worker));
  return results;
}

export type DriveDownloads = {
  files: File[];
  failed: { name: string; code: DriveErrorCode }[];
};

/** Télécharge les fichiers Drive choisis (voir runFirstThenParallel) ; les échecs sont rapportés, jamais bloquants. */
export async function downloadDriveFiles(
  picked: DriveFileOut[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<DriveDownloads> {
  const results = await runFirstThenParallel(picked, (file) => downloadDriveFile(file.id, signal), 3, onProgress);
  const out: DriveDownloads = { files: [], failed: [] };
  results.forEach((result, index) => {
    if (result.ok) out.files.push(result.data);
    else out.failed.push({ name: picked[index].name, code: result.code });
  });
  return out;
}

const TYPE_LABELS: Record<string, string> = {
  "application/vnd.google-apps.document": "Docs",
  "application/vnd.google-apps.spreadsheet": "Sheets",
  "application/vnd.google-apps.presentation": "Slides",
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "text/plain": "TXT",
  "text/markdown": "MD",
  "text/csv": "CSV",
};

/** Étiquette courte du format (identique dans toutes les langues). */
export function driveTypeLabel(file: Pick<DriveFileOut, "mime_type" | "is_folder">): string {
  if (file.is_folder) return "";
  if (TYPE_LABELS[file.mime_type]) return TYPE_LABELS[file.mime_type];
  if (file.mime_type.startsWith("image/")) return "IMG";
  return "";
}

export function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1_048_576).toFixed(1).replace(/\.0$/, "")} Mo`;
}
