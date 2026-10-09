"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import { DRIVE_SHARED, driveTypeLabel, formatSize, listDrive, type DriveErrorCode, type DriveFileOut } from "@/lib/drive";
import { GoogleDriveIcon } from "./brand-icons";
import { Dialog, DialogHeader } from "./dialog";
import { FileLink } from "./file-viewer";
import { CheckIcon, ChevronIcon, DownloadIcon, FileIcon, FolderIcon, SearchIcon } from "./icons";

type Labels = Dictionary["workspace"]["drive"];

type Tab = "my" | "shared" | "project";
type Crumb = { id: string; name: string };
type Loaded = { key: string; files: DriveFileOut[]; next: string | null; error: DriveErrorCode | null };

/** Document déjà indexé dans le projet — pour l'onglet de référence qui évite de réimporter un doublon.
 * L'URL et le libellé de statut (traduit, null = indexé avec succès, rien à signaler) sont précalculés par
 * l'appelant (project-detail.tsx connaît déjà projectId et les libellés `docStatus`), le picker reste sans
 * dépendance sur la forme exacte des documents d'un projet. */
export type ExistingDocument = { id: string; name: string; statusLabel: string | null; url: string };

/**
 * Sélecteur de fichiers Google Drive : parcourir « Mon Drive » ou « Partagés avec moi »,
 * chercher (nom + contenu), cocher plusieurs fichiers — la sélection survit aux changements
 * de dossier et de recherche. Les documents Google natifs sont convertis en Office côté serveur.
 *
 * `onConfirm` fait le vrai travail (joindre au message, importer dans le projet) ; la fenêtre
 * se ferme quand il se termine.
 */
export function DrivePicker({
  lang,
  labels,
  open,
  onClose,
  max,
  confirmLabel,
  onConfirm,
  onImportFolder,
  existingDocuments,
}: {
  lang: Locale;
  labels: Labels;
  open: boolean;
  onClose: () => void;
  /** Nombre maximum de fichiers sélectionnables en une fois. */
  max: number;
  confirmLabel: "attach" | "import";
  onConfirm: (files: DriveFileOut[]) => Promise<void>;
  /** Importer un dossier Drive ENTIER (récursif), plutôt que des fichiers choisis un par un — n'a de sens
   * que pour confirmLabel "import" (projet) ; absent, aucune affordance de dossier n'apparaît. Ne ferme pas
   * la fenêtre : l'utilisateur peut enchaîner plusieurs imports de dossiers ou continuer à choisir des fichiers. */
  onImportFolder?: (file: DriveFileOut) => void;
  /** Documents déjà dans le projet — absent, pas d'onglet « Dans ce projet » (ex. pièce jointe de chat, qui
   * n'a pas cette notion). Présent, même vide : l'onglet existe pour que l'utilisateur vérifie l'absence. */
  existingDocuments?: ExistingDocument[];
}) {
  return (
    <Dialog open={open} onClose={onClose} label={labels.title} className="max-w-[56rem]">
      {/* Monté seulement ouvert : fermer remet à zéro la sélection, la recherche et le dossier. */}
      <PickerBody lang={lang} labels={labels} onClose={onClose} max={max} confirmLabel={confirmLabel} onConfirm={onConfirm} onImportFolder={onImportFolder} existingDocuments={existingDocuments} />
    </Dialog>
  );
}

function PickerBody({
  lang,
  labels,
  onClose,
  max,
  confirmLabel,
  onConfirm,
  onImportFolder,
  existingDocuments,
}: {
  lang: Locale;
  labels: Labels;
  onClose: () => void;
  max: number;
  confirmLabel: "attach" | "import";
  onConfirm: (files: DriveFileOut[]) => Promise<void>;
  onImportFolder?: (file: DriveFileOut) => void;
  existingDocuments?: ExistingDocument[];
}) {
  const [tab, setTab] = useState<Tab>("my");
  const [trail, setTrail] = useState<Crumb[]>([]);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [selected, setSelected] = useState<Map<string, DriveFileOut>>(new Map());
  const [busy, setBusy] = useState(false);

  const folderId = trail.at(-1)?.id ?? (tab === "shared" ? DRIVE_SHARED : null);
  const searching = debounced.length >= 2;
  // Identifie la requête affichée : tant que `loaded` en porte une autre, on charge.
  const key = `${reload}|${searching ? `q:${debounced}` : `f:${folderId ?? "root"}`}`;
  const loading = loaded?.key !== key;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (tab === "project") return; // liste locale (existingDocuments), aucun appel Drive.
    const controller = new AbortController();
    void (async () => {
      const result = await listDrive({ query: searching ? debounced : undefined, folderId }, controller.signal);
      if (controller.signal.aborted) return;
      setLoaded(result.ok ? { key, files: result.data.files, next: result.data.next_page_token, error: null } : { key, files: [], next: null, error: result.code });
    })();
    return () => controller.abort();
  }, [key, searching, debounced, folderId, tab]);

  const loadMore = async () => {
    if (!loaded?.next || moreBusy) return;
    setMoreBusy(true);
    const result = await listDrive({ query: searching ? debounced : undefined, folderId, pageToken: loaded.next });
    setMoreBusy(false);
    if (result.ok) setLoaded((prev) => (prev && prev.key === key ? { ...prev, files: [...prev.files, ...result.data.files], next: result.data.next_page_token } : prev));
  };

  const toggle = (file: DriveFileOut) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(file.id)) next.delete(file.id);
      else if (next.size < max) next.set(file.id, file);
      return next;
    });

  const confirm = async () => {
    if (!selected.size || busy) return;
    setBusy(true);
    try {
      await onConfirm([...selected.values()]);
    } finally {
      setBusy(false);
    }
    onClose();
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setTrail([]);
    setQuery("");
    setDebounced("");
  };

  const dateFormat = useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }), [lang]);
  const link = `/oauth/google?lang=${lang}&link=1`;
  const atMax = selected.size >= max;
  const error = loaded?.key === key ? loaded.error : null;
  const files = loaded?.key === key ? loaded.files : [];

  return (
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <DialogHeader title={<span className="inline-flex items-center gap-2"><GoogleDriveIcon size={18} />{labels.title}</span>} closeLabel={labels.close} onClose={onClose} />

      <div className="flex flex-col gap-3 border-b border-border px-5 py-3">
        <div className="relative">
          <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "project" ? labels.searchProject : labels.search}
            aria-label={tab === "project" ? labels.searchProject : labels.search}
            className="h-10 w-full rounded-button border border-border bg-surface pr-3 pl-9 text-message text-ink placeholder:text-ink-3 focus:border-bordeaux-700 focus:shadow-focus focus:outline-none"
          />
        </div>
        {/* La recherche Drive remplace tout l'arbre de dossiers (globale, Drive entier) — l'onglet « Dans ce
         * projet » n'a pas cette notion : sa liste est déjà locale, le champ ne fait que la filtrer, les
         * onglets restent visibles. */}
        {tab !== "project" && searching ? (
          <p className="text-meta text-ink-3">{labels.searchResults}</p>
        ) : (
          <nav aria-label={labels.title} className="flex flex-wrap items-center gap-1 text-label">
            <div role="tablist" className="mr-2 inline-flex rounded-button bg-surface p-0.5">
              {(existingDocuments ? (["my", "shared", "project"] as const) : (["my", "shared"] as const)).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => switchTab(value)}
                  className={`rounded-badge px-2.5 py-1 text-meta ${tab === value ? "bg-surface font-medium text-ink shadow-card" : "text-ink-3 hover:text-ink"}`}
                >
                  {value === "my" ? labels.myDrive : value === "shared" ? labels.shared : labels.inProject}
                </button>
              ))}
            </div>
            {tab !== "project" &&
              trail.map((crumb, index) => (
                <span key={crumb.id} className="inline-flex items-center gap-1">
                  <ChevronIcon size={12} className="-rotate-90 text-ink-3" />
                  <button
                    type="button"
                    disabled={index === trail.length - 1}
                    onClick={() => setTrail((current) => current.slice(0, index + 1))}
                    className="max-w-[10rem] truncate text-ink-2 hover:text-ink disabled:font-medium disabled:text-ink"
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
          </nav>
        )}
      </div>

      <div className="min-h-[22rem] flex-1 overflow-y-auto px-2 py-2">
        {tab === "project" ? (
          <ProjectDocumentsList documents={existingDocuments ?? []} query={query} labels={labels} />
        ) : loading ? (
          <p role="status" className="px-3 py-8 text-center text-secondary text-ink-3">{labels.loading}</p>
        ) : error ? (
          <DriveError code={error} labels={labels} link={link} onRetry={() => setReload((n) => n + 1)} />
        ) : files.length === 0 ? (
          <p className="px-3 py-8 text-center text-secondary text-ink-3">{searching ? labels.emptySearch : labels.empty}</p>
        ) : (
          <ul role="listbox" aria-multiselectable aria-label={labels.title} className="flex flex-col gap-px">
            {files.map((file) => {
              const checked = selected.has(file.id);
              const type = driveTypeLabel(file);
              const modified = file.modified_time ? dateFormat.format(new Date(file.modified_time)) : "";
              if (file.is_folder) {
                return (
                  <li key={file.id} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setDebounced("");
                        setTrail((current) => [...current, { id: file.id, name: file.name }]);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-nav px-3 py-2.5 text-left hover:bg-active"
                    >
                      <FolderIcon size={18} className="shrink-0 text-bordeaux-700" />
                      <span className="min-w-0 flex-1 truncate text-label text-ink">{file.name}</span>
                      <ChevronIcon size={14} className="-rotate-90 text-ink-3" />
                    </button>
                    {onImportFolder && (
                      <button
                        type="button"
                        title={labels.importFolder.replace("{name}", file.name)}
                        aria-label={labels.importFolder.replace("{name}", file.name)}
                        onClick={() => onImportFolder(file)}
                        className="mr-1 shrink-0 rounded-nav p-2 text-ink-3 hover:bg-active hover:text-bordeaux-700"
                      >
                        <DownloadIcon size={16} />
                      </button>
                    )}
                  </li>
                );
              }
              const disabled = !file.importable || (!checked && atMax);
              return (
                <li key={file.id} role="option" aria-selected={checked} aria-disabled={disabled}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(file)}
                    title={!file.importable ? labels.unsupported : undefined}
                    className={`flex w-full items-center gap-3 rounded-nav px-3 py-2.5 text-left ${checked ? "bg-peche-100" : "hover:bg-active"} disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent`}
                  >
                    <span
                      aria-hidden
                      className={`flex size-5 shrink-0 items-center justify-center rounded-badge border ${checked ? "border-bordeaux-700 bg-bordeaux-700 text-white" : "border-border bg-surface"}`}
                    >
                      {checked && <CheckIcon size={13} />}
                    </span>
                    <FileIcon size={18} className="shrink-0 text-ink-3" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-label text-ink">{file.name}</span>
                      <span className="truncate text-meta text-ink-3">
                        {!file.importable ? labels.unsupported : [modified && labels.modified.replace("{date}", modified), formatSize(file.size)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {type && <span className="shrink-0 rounded-badge bg-surface px-1.5 py-0.5 text-meta text-ink-3">{type}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!loading && !error && loaded?.next && (
          <div className="px-3 py-2">
            <button type="button" onClick={() => void loadMore()} disabled={moreBusy} className="rounded-button px-3 py-1.5 text-label text-bordeaux-700 hover:bg-active disabled:opacity-60">
              {moreBusy ? labels.loading : labels.loadMore}
            </button>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <p className={`text-meta ${atMax ? "text-bordeaux-700" : "text-ink-3"}`}>
            {atMax ? labels.maxReached.replace("{max}", String(max)) : labels.selected.replace("{n}", String(selected.size)).replace("{max}", String(max))}
          </p>
          <p className="truncate text-meta text-ink-3">{labels.nativeHint}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-button px-3.5 py-2 text-label font-medium text-ink hover:bg-active">
          {labels.cancel}
        </button>
        <button
          type="button"
          disabled={!selected.size || busy}
          onClick={() => void confirm()}
          className="rounded-button bg-bordeaux-700 px-3.5 py-2 text-label font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60"
        >
          {busy ? labels.working : (confirmLabel === "attach" ? labels.confirmAttach : labels.confirmImport).replace("{n}", String(selected.size))}
        </button>
      </footer>
    </div>
  );
}

/** Onglet « Dans ce projet » : liste de référence, lecture seule (on ouvre, on ne coche pas) — le scroll vient
 * du conteneur parent, pas d'ici (même zone que la liste Drive, voir min-h-[22rem] overflow-y-auto). */
function ProjectDocumentsList({ documents, query, labels }: { documents: ExistingDocument[]; query: string; labels: Labels }) {
  const q = query.trim().toLowerCase();
  const filtered = q ? documents.filter((doc) => doc.name.toLowerCase().includes(q)) : documents;

  if (documents.length === 0) {
    return <p className="px-3 py-8 text-center text-secondary text-ink-3">{labels.inProjectEmpty}</p>;
  }
  if (filtered.length === 0) {
    return <p className="px-3 py-8 text-center text-secondary text-ink-3">{labels.emptySearch}</p>;
  }
  return (
    <ul className="flex flex-col gap-px">
      {filtered.map((doc) => (
        <li key={doc.id}>
          <FileLink url={doc.url} name={doc.name} className="flex w-full items-center gap-3 rounded-nav px-3 py-2.5 text-left text-ink no-underline hover:bg-active">
            <FileIcon size={18} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 truncate text-label text-ink">{doc.name}</span>
            {doc.statusLabel && <span className="shrink-0 rounded-badge bg-surface px-1.5 py-0.5 text-meta text-ink-3">{doc.statusLabel}</span>}
          </FileLink>
        </li>
      ))}
    </ul>
  );
}

function DriveError({ code, labels, link, onRetry }: { code: DriveErrorCode; labels: Labels; link: string; onRetry: () => void }) {
  const message = (labels.errors as Record<string, string>)[code] ?? labels.errors.unavailable;
  const needsGoogle = code === "not_connected" || code === "scope_missing";
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <p className="text-label text-ink text-pretty">{message}</p>
      {needsGoogle ? (
        <a href={link} className="rounded-button bg-bordeaux-700 px-3.5 py-2 text-label font-medium text-white no-underline hover:bg-bordeaux-900">
          {code === "scope_missing" ? labels.authorize : labels.connect}
        </a>
      ) : (
        <button type="button" onClick={onRetry} className="rounded-button border border-border bg-surface px-3.5 py-2 text-label font-medium text-bordeaux-700 hover:border-bordeaux-700/40">
          {labels.retry}
        </button>
      )}
    </div>
  );
}
