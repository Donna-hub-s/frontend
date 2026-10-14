"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import {
  POLL_MS,
  browseNas,
  createNasLink,
  crumbs,
  fetchNasLinks,
  fetchNasStatus,
  isRunning,
  joinPath,
  justFinished,
  locationLabel,
  needsAttention,
  setNasAutoSync,
  syncNasLink,
  unlinkNas,
  type NasLink,
  type NasStatus,
} from "@/lib/nas";
import { parseBackendDate } from "@/lib/workspace-types";
import { Dialog, DialogHeader } from "./dialog";
import { FolderIcon, PlusIcon, TrashIcon } from "./icons";

type Labels = Dictionary["workspace"]["projects"];
type NasLabels = Labels["nas"];

// Relecture lente quand rien ne tourne : une synchronisation automatique du serveur doit finir par se voir sans recharger la page.
const IDLE_POLL_MS = 30_000;

const primaryButton = "rounded-button bg-brand-fill px-3.5 py-2 text-label font-medium text-white hover:bg-brand-fill-strong disabled:opacity-60";
const ghostButton = "rounded-button px-3.5 py-2 text-label font-medium text-ink hover:bg-active disabled:opacity-60";

function errorText(labels: NasLabels, status: number): string {
  return status === 400 ? labels.errors.link400 : status === 403 ? labels.errors.link403 : status === 409 ? labels.errors.link409 : labels.errors.generic;
}

/**
 * Dossiers du NAS liés à un projet : liste, état de la synchronisation, « Synchroniser », réglage automatique, déliement et choix
 * d'un dossier. N'affiche rien tant que le serveur ne dit pas que le connecteur existe pour cet utilisateur (un espace qui n'est
 * pas celui du NAS ne voit même pas la section). `onSynced` est rappelé quand une passe vient de finir : le parent relit alors la
 * liste des documents du projet.
 */
export function NasSection({ lang, labels, projectId, canEdit, onSynced }: { lang: Locale; labels: Labels; projectId: string; canEdit: boolean; onSynced: () => void }) {
  const n = labels.nas;
  const [status, setStatus] = useState<NasStatus | null>(null);
  const [links, setLinks] = useState<NasLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [unlinking, setUnlinking] = useState<NasLink | null>(null);
  const linksRef = useRef<NasLink[]>([]);
  const syncedRef = useRef(onSynced);
  useEffect(() => {
    syncedRef.current = onSynced;
  }, [onSynced]);

  const apply = (next: NasLink[]) => {
    if (justFinished(linksRef.current, next)) syncedRef.current();
    linksRef.current = next;
    setLinks(next);
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const result = await fetchNasStatus();
      if (!live || !result.ok || !result.data?.enabled) return;
      setStatus(result.data);
      const list = await fetchNasLinks(projectId);
      if (live && list.ok && list.data) apply(list.data);
    })();
    return () => {
      live = false;
    };
  }, [projectId]);

  const running = links.some((link) => isRunning(link.status));
  const enabled = Boolean(status?.enabled);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const timer = setTimeout(async () => {
      const list = await fetchNasLinks(projectId);
      if (live && list.ok && list.data) apply(list.data);
    }, running ? POLL_MS : IDLE_POLL_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [enabled, running, links, projectId]);

  if (!status?.enabled) return null;
  const canManage = status.can_manage && canEdit;
  if (links.length === 0 && !canManage) return null;

  const replace = (updated: NasLink) => apply(linksRef.current.map((link) => (link.id === updated.id ? updated : link)));

  const link = async (root: string, path: string, autoSync: boolean): Promise<string | null> => {
    const result = await createNasLink(projectId, root, path, autoSync);
    if (!result.ok || !result.data) return errorText(n, result.status);
    apply([...linksRef.current, result.data]);
    return null;
  };

  const sync = async (target: NasLink) => {
    setError(null);
    const result = await syncNasLink(projectId, target.id);
    if (result.ok && result.data) replace(result.data);
    else setError(result.status === 409 ? n.errors.syncBusy : n.errors.generic);
  };

  const toggleAuto = async (target: NasLink) => {
    setError(null);
    const result = await setNasAutoSync(projectId, target.id, !target.auto_sync);
    if (result.ok && result.data) replace(result.data);
    else setError(n.errors.generic);
  };

  const unlink = async (target: NasLink, removeDocuments: boolean) => {
    const result = await unlinkNas(projectId, target.id, removeDocuments);
    setUnlinking(null);
    if (!result.ok) return setError(n.errors.generic);
    apply(linksRef.current.filter((l) => l.id !== target.id));
    if (removeDocuments) syncedRef.current(); // des documents sont partis : relire la liste
  };

  return (
    <section aria-label={n.title} className="border-t border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <FolderIcon size={16} className="shrink-0 text-brand" />
        <h3 className="text-label font-medium text-ink">{n.title}</h3>
        {canManage && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-button px-2 py-1 text-meta font-medium text-brand hover:bg-active"
          >
            <PlusIcon size={14} />
            {n.link}
          </button>
        )}
      </div>
      <p className="mt-1 text-meta text-ink-3 text-pretty">{n.hint}</p>
      {status.sync_interval_min === 0 && <p className="mt-1 text-meta text-ink-3">{n.autoSyncOff}</p>}
      {error && (
        <p role="alert" className="mt-2 text-meta text-danger">
          {error}
        </p>
      )}

      {links.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {links.map((item) => (
            <LinkRow
              key={item.id}
              lang={lang}
              labels={n}
              link={item}
              canEdit={canEdit}
              intervalMin={status.sync_interval_min}
              onSync={() => void sync(item)}
              onToggleAuto={() => void toggleAuto(item)}
              onUnlink={() => setUnlinking(item)}
            />
          ))}
        </ul>
      )}

      <NasPicker labels={labels} status={status} open={pickerOpen} onClose={() => setPickerOpen(false)} onLink={link} />

      <Dialog open={unlinking !== null} onClose={() => setUnlinking(null)} label={n.unlink} className="max-w-[28rem]">
        {unlinking && (
          <div className="p-5">
            <h2 className="text-panel-title font-medium text-ink">{n.unlinkTitle.replace("{name}", locationLabel(unlinking.root, unlinking.path))}</h2>
            <p className="mt-1.5 text-secondary text-ink-2 text-pretty">{n.unlinkBody}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setUnlinking(null)} className={ghostButton}>
                {labels.cancel}
              </button>
              <button type="button" onClick={() => void unlink(unlinking, false)} className={ghostButton}>
                {n.unlinkKeep}
              </button>
              <button type="button" onClick={() => void unlink(unlinking, true)} className="rounded-button bg-danger-fill px-3.5 py-2 text-label font-medium text-white">
                {n.unlinkRemove}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}

function LinkRow({
  lang,
  labels,
  link,
  canEdit,
  intervalMin,
  onSync,
  onToggleAuto,
  onUnlink,
}: {
  lang: Locale;
  labels: NasLabels;
  link: NasLink;
  canEdit: boolean;
  intervalMin: number;
  onSync: () => void;
  onToggleAuto: () => void;
  onUnlink: () => void;
}) {
  const busy = isRunning(link.status);
  const statusLabel = (labels.status as Record<string, string>)[link.status] ?? labels.status.failed;
  const attention = needsAttention(link.status);
  const synced = parseBackendDate(link.last_sync_at);
  const when = synced === null ? labels.neverSynced : labels.lastSync.replace("{date}", new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" }).format(synced));
  const counts = busy
    ? labels.countsRunning.replace("{indexed}", String(link.files_indexed)).replace("{total}", String(link.files_total))
    : labels.counts.replace("{indexed}", String(link.files_indexed)).replace("{failed}", String(link.files_failed)).replace("{skipped}", String(link.files_skipped));

  return (
    <li className="rounded-card border border-border bg-surface p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-label font-medium text-ink" title={locationLabel(link.root, link.path)}>
            {locationLabel(link.root, link.path)}
          </p>
          <p className={`mt-0.5 flex items-center gap-1.5 text-meta ${attention ? "text-attention" : "text-ink-2"}`} role={busy ? "status" : undefined}>
            {busy && <span className="pending-dot size-1.5 rounded-full bg-brand-fill" />}
            {statusLabel}
          </p>
          <p className="text-meta text-ink-3">{counts}</p>
          <p className="text-meta text-ink-3">{when}</p>
          {link.last_message && <p className={`mt-1 text-meta text-pretty ${attention ? "text-attention" : "text-ink-3"}`}>{link.last_message}</p>}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onUnlink}
            aria-label={`${labels.unlink} ${locationLabel(link.root, link.path)}`}
            title={labels.unlink}
            className="shrink-0 rounded-badge p-1.5 text-ink-3 hover:bg-danger/[0.06] hover:text-danger"
          >
            <TrashIcon size={15} />
          </button>
        )}
      </div>
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" disabled={busy} onClick={onSync} className="rounded-button bg-fill px-3 py-1.5 text-label font-medium text-ink hover:bg-active disabled:opacity-60">
            {labels.sync}
          </button>
          <label className="flex items-center gap-2 text-meta text-ink-2" title={intervalMin > 0 ? labels.autoSyncEvery.replace("{n}", String(intervalMin)) : labels.autoSyncOff}>
            <input type="checkbox" checked={link.auto_sync} onChange={onToggleAuto} className="size-4 accent-brand" />
            {labels.autoSync}
          </label>
        </div>
      )}
    </li>
  );
}

/** Choix d'un sous-dossier d'une racine du NAS : on descend dossier par dossier, « Lier ce dossier » valide l'endroit où l'on est. */
function NasPicker({
  labels,
  status,
  open,
  onClose,
  onLink,
}: {
  labels: Labels;
  status: NasStatus;
  open: boolean;
  onClose: () => void;
  onLink: (root: string, path: string, autoSync: boolean) => Promise<string | null>;
}) {
  const n = labels.nas;
  const [root, setRoot] = useState(status.roots[0] ?? "");
  const [path, setPath] = useState("");
  const [directories, setDirectories] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !root) return;
    let live = true;
    void (async () => {
      const result = await browseNas(root, path);
      if (!live) return;
      setFailed(!result.ok || !result.data);
      setDirectories(result.data?.directories ?? []);
      setTruncated(Boolean(result.data?.truncated));
    })();
    return () => {
      live = false;
    };
  }, [open, root, path]);

  // Un lien réussi referme la fenêtre (onLink renvoie null) ; sinon l'erreur reste affichée dans la fenêtre.
  const submit = async () => {
    setBusy(true);
    const problem = await onLink(root, path, autoSync);
    setBusy(false);
    setError(problem);
    if (!problem) {
      setPath("");
      onClose();
    }
  };

  const trail = crumbs(path);
  return (
    <Dialog open={open} onClose={onClose} label={n.pickerTitle} className="flex max-h-[min(36rem,calc(100dvh-2rem))] max-w-[32rem] flex-col">
      <DialogHeader title={n.pickerTitle} subtitle={n.pickerHint} closeLabel={labels.close} onClose={onClose} />
      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {status.roots.length > 1 && (
          <label className="mb-3 flex items-center gap-2 text-meta text-ink-2">
            {n.rootLabel}
            <select
              value={root}
              onChange={(event) => {
                setRoot(event.target.value);
                setPath("");
              }}
              className="rounded-button border border-border bg-surface px-2 py-1 text-label text-ink"
            >
              {status.roots.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

        <nav aria-label={n.pickerTitle} className="flex flex-wrap items-center gap-1 text-label">
          <button type="button" onClick={() => setPath("")} className="rounded-badge px-1.5 py-0.5 font-medium text-brand hover:bg-active">
            {root}
          </button>
          {trail.map((crumb) => (
            <span key={crumb.path} className="flex items-center gap-1">
              <span aria-hidden className="text-ink-3">
                ›
              </span>
              <button type="button" onClick={() => setPath(crumb.path)} className="rounded-badge px-1.5 py-0.5 text-ink hover:bg-active">
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        {failed ? (
          <p role="alert" className="mt-3 text-secondary text-danger">
            {n.browseError}
          </p>
        ) : directories.length === 0 ? (
          <p className="mt-3 text-secondary text-ink-3">{n.noSubfolders}</p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {directories.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => setPath(joinPath(path, name))}
                  className="flex w-full items-center gap-2.5 rounded-badge px-2 py-2 text-left text-label text-ink hover:bg-active"
                >
                  <FolderIcon size={16} className="shrink-0 text-brand" />
                  <span className="truncate">{name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {truncated && <p className="mt-2 text-meta text-ink-3">{n.truncated}</p>}
      </div>
      <footer className="border-t border-border px-5 py-4">
        {error && (
          <p role="alert" className="mb-3 text-secondary text-danger">
            {error}
          </p>
        )}
        <label className="mb-3 flex items-center gap-2 text-meta text-ink-2">
          <input type="checkbox" checked={autoSync} onChange={(event) => setAutoSync(event.target.checked)} className="size-4 accent-brand" />
          {n.autoSync}
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-meta text-ink-3">{locationLabel(root, path)}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className={ghostButton}>
              {labels.cancel}
            </button>
            <button type="button" disabled={busy || failed} onClick={() => void submit()} className={primaryButton}>
              {n.chooseThis}
            </button>
          </div>
        </div>
      </footer>
    </Dialog>
  );
}
