"use client";

import { Check, Clock, Download, Eye, FileText, PencilLine, Plus, Printer, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { canvasActivity, canvasUrls, EXPORT_FORMATS, type CanvasMeta, type CanvasVersionMeta, type CanvasExportFormat, type SaveStatus } from "@/lib/canvas";
import { diffLines, diffStats, foldUnchanged } from "@/lib/diff";
import { useCanvas, type CanvasController } from "@/lib/use-canvas";
import type { ChatMessage } from "@/lib/workspace-types";
import { CanvasEditor } from "./canvas-editor";
import { useWorkspace } from "./workspace-provider";

type Labels = Dictionary["workspace"]["canvas"];

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

const BUTTON = "inline-flex size-8 items-center justify-center rounded-button text-ink-2 hover:bg-active hover:text-ink disabled:opacity-40";

/**
 * Le volet « Document » d'une conversation : DONNA et l'utilisateur modifient le même texte tour à tour. Enveloppe la conversation :
 * un bouton en haut à droite l'ouvre ; ouvert, il partage la largeur avec la discussion (plein écran sur téléphone) et masque le
 * panneau d'activité, trop étroit pour deux colonnes de plus.
 */
export function CanvasHost({
  lang,
  labels,
  conversationId,
  messages,
  children,
}: {
  lang: string;
  labels: Labels;
  conversationId: string | null;
  messages: ChatMessage[];
  children: ReactNode;
}) {
  const activity = useMemo(() => canvasActivity(messages), [messages]);
  const canvas = useCanvas(conversationId, activity.key, activity.canvasId);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(activity.key);
  const { preview } = useWorkspace();
  const previewOpen = preview !== null;
  const [lastPreviewOpen, setLastPreviewOpen] = useState(previewOpen);

  // DONNA vient de créer ou modifier le document : on l'ouvre (ajustement d'état pendant le rendu, voir la doc React).
  if (activity.key !== lastSeen) {
    setLastSeen(activity.key);
    if (activity.count > 0) setOpen(true);
  }

  // Un seul panneau docké à la fois : un aperçu de fichier qui s'ouvre ferme le canvas (jamais
  // l'inverse — ouvrir le canvas pendant qu'un aperçu est déjà affiché resterait surprenant).
  // Même patron d'ajustement d'état pendant le rendu que ci-dessus, pas un useEffect (évite les
  // rendus en cascade).
  if (previewOpen !== lastPreviewOpen) {
    setLastPreviewOpen(previewOpen);
    if (previewOpen) setOpen(false);
  }

  useEffect(() => {
    if (open) document.body.dataset.canvasOpen = "true";
    else delete document.body.dataset.canvasOpen;
    return () => {
      delete document.body.dataset.canvasOpen;
    };
  }, [open]);

  const count = canvas.list?.length ?? 0;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {conversationId && (count > 0 || open) && (
          <div className="flex shrink-0 justify-end px-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label={open ? labels.toggleClose : labels.toggleOpen}
              className={`inline-flex h-8 items-center gap-1.5 rounded-button border px-3 text-label font-medium transition-colors ${
                open ? "border-brand/30 bg-brand/10 text-brand" : "border-border bg-surface text-ink hover:bg-active"
              }`}
            >
              <FileText size={15} aria-hidden />
              {labels.toggle}
              {count > 1 && <span className="rounded-full bg-brand-fill px-1.5 text-meta text-white">{count}</span>}
            </button>
          </div>
        )}
        {children}
      </div>
      {open && <CanvasPanel lang={lang} labels={labels} canvas={canvas} conversationId={conversationId} onClose={() => setOpen(false)} />}
    </div>
  );
}

function CanvasPanel({
  lang,
  labels,
  canvas,
  conversationId,
  onClose,
}: {
  lang: string;
  labels: Labels;
  canvas: CanvasController;
  conversationId: string | null;
  onClose: () => void;
}) {
  const { editor, list, activeId } = canvas;
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = list?.find((item) => item.id === activeId) ?? null;

  return (
    <aside
      aria-label={labels.panelLabel}
      className="fixed inset-0 z-40 flex flex-col bg-surface lg:static lg:inset-auto lg:z-auto lg:w-[46%] lg:max-w-[46rem] lg:min-w-[24rem] lg:border-l lg:border-border"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        {list && list.length > 1 ? (
          <select
            aria-label={labels.pickLabel}
            value={activeId ?? ""}
            onChange={(event) => canvas.select(event.target.value)}
            className="max-w-[10rem] truncate rounded-button border border-border bg-surface px-2 py-1.5 text-label text-ink"
          >
            {list.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        ) : null}
        {editor.doc?.id ? (
          <input
            value={editor.title}
            onChange={(event) => canvas.edit({ title: event.target.value })}
            aria-label={labels.titleLabel}
            maxLength={120}
            placeholder={labels.untitled}
            className="min-w-[8rem] flex-1 truncate rounded-button bg-transparent px-2 py-1.5 text-panel-title font-medium text-ink outline-none hover:bg-fill focus:bg-fill"
          />
        ) : (
          <span className="flex-1 px-2 text-panel-title font-medium text-ink">{labels.panelLabel}</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {editor.doc?.id && (
            <>
              <button type="button" className={BUTTON} onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen} aria-label={labels.history} title={labels.history}>
                <Clock size={17} />
              </button>
              <ExportMenu id={editor.doc.id} labels={labels} />
              <button type="button" className={BUTTON} onClick={() => setConfirmDelete(true)} aria-label={labels.delete} title={labels.delete}>
                <Trash2 size={17} />
              </button>
            </>
          )}
          <button type="button" className={BUTTON} onClick={() => void canvas.create()} disabled={!conversationId} aria-label={labels.new} title={labels.new}>
            <Plus size={18} />
          </button>
          <button type="button" className={BUTTON} onClick={onClose} aria-label={labels.close} title={labels.close}>
            <X size={18} />
          </button>
        </div>
      </header>

      {canvas.createError !== null && (
        <p role="alert" className="border-b border-border bg-danger/[0.06] px-4 py-2 text-secondary text-danger">
          {canvas.createError || labels.createLimit}
        </p>
      )}

      {confirmDelete && (
        <div role="alertdialog" aria-label={labels.delete} className="flex flex-wrap items-center gap-3 border-b border-border bg-danger/[0.06] px-4 py-2.5 text-secondary text-danger">
          <span className="flex-1 text-pretty">{labels.deleteConfirm}</span>
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              void canvas.remove();
            }}
            className="rounded-button bg-danger-fill px-3 py-1.5 text-label font-medium text-white"
          >
            {labels.deleteYes}
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-button px-3 py-1.5 text-label font-medium text-ink hover:bg-active">
            {labels.cancel}
          </button>
        </div>
      )}

      {canvas.loadFailed && (
        <p role="alert" className="border-b border-border px-4 py-2 text-secondary text-danger">
          {labels.loadError}
        </p>
      )}

      {editor.status === "conflict" && editor.conflict && <ConflictBanner labels={labels} canvas={canvas} />}
      {editor.updatedByDonna && editor.doc && editor.status !== "conflict" && (
        <div role="status" className="flex flex-wrap items-center gap-3 border-b border-border bg-brand/[0.06] px-4 py-2 text-secondary text-brand-strong">
          <span className="flex-1">{fill(labels.donnaUpdated, { n: editor.doc.version })}</span>
          <button
            type="button"
            onClick={() => {
              setHistoryOpen(true);
              canvas.dismissNotice();
            }}
            className="font-medium underline"
          >
            {labels.seeChanges}
          </button>
          <button type="button" onClick={canvas.dismissNotice} className="font-medium text-ink-2 hover:text-ink">
            {labels.dismiss}
          </button>
        </div>
      )}

      {!editor.doc?.id ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <FileText size={30} className="text-ink-3" aria-hidden />
          <p className="max-w-[22rem] text-secondary text-ink-3 text-pretty">{labels.empty}</p>
          <button type="button" onClick={() => void canvas.create()} className="rounded-button bg-brand-fill px-4 py-2 text-label font-medium text-white hover:bg-brand-fill-strong">
            {labels.createFirst}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-border px-3 py-1.5">
            <div role="tablist" className="inline-flex rounded-button bg-fill p-0.5">
              <ModeTab selected={mode === "write"} onSelect={() => setMode("write")} icon={<PencilLine size={14} aria-hidden />} label={labels.tabWrite} />
              <ModeTab selected={mode === "preview"} onSelect={() => setMode("preview")} icon={<Eye size={14} aria-hidden />} label={labels.tabPreview} />
            </div>
            <SaveBadge status={editor.status} labels={labels} />
            <span className="ml-auto text-meta text-ink-3 tabular-nums">
              {fill(labels.version, { n: editor.doc.version })} · {fill(labels.chars, { n: editor.content.length.toLocaleString(lang) })}
            </span>
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col">
            {mode === "write" ? (
              <CanvasEditor
                value={editor.content}
                onChange={(content) => canvas.edit({ content })}
                placeholder={labels.placeholder}
                ariaLabel={editor.title || labels.untitled}
              />
            ) : editor.content.trim() ? (
              <DocumentPreview
                canvasId={editor.doc.id}
                version={editor.doc.version}
                title={editor.title || labels.panelLabel}
                printLabel={labels.printPdf}
              />
            ) : (
              <p className="px-5 py-4 text-secondary text-ink-3">{labels.previewEmpty}</p>
            )}
            {historyOpen && <HistoryView labels={labels} canvas={canvas} lang={lang} active={active} onClose={() => setHistoryOpen(false)} />}
          </div>
        </>
      )}
    </aside>
  );
}

/**
 * Aperçu d'un document partagé : le HTML rendu par le serveur, dans un cadre isolé.
 *
 * Un seul rendu pour l'écran, le PDF et le Word — sinon un export finit toujours par diverger de ce qu'on voit. Le
 * cadre autorise `allow-same-origin` SANS `allow-scripts` : c'est ce qui permet à la page de déclencher l'impression
 * (un PDF au rendu exact), sans jamais donner au document le moindre droit dans l'application. Le CSP du document
 * (`default-src 'none'`) refuse de son côté tout script, toute image et toute police distante.
 */
function DocumentPreview({ canvasId, version, title, printLabel }: { canvasId: string; version: number; title: string; printLabel: string }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end border-b border-border px-3 py-1">
        <button
          type="button"
          onClick={() => frame.current?.contentWindow?.print()}
          className="inline-flex items-center gap-1.5 rounded-button px-2.5 py-1 text-label text-ink-2 hover:bg-active hover:text-ink"
        >
          <Printer size={14} aria-hidden />
          {printLabel}
        </button>
      </div>
      {/* La version est la clé : le cadre se recharge quand le document est enregistré (DONNA peut l'écrire aussi). */}
      <iframe
        key={`${canvasId}:${version}`}
        ref={frame}
        title={title}
        sandbox="allow-same-origin allow-popups-to-escape-sandbox"
        src={canvasUrls.render(canvasId)}
        data-testid="canvas-preview-frame"
        className="min-h-0 flex-1 border-0"
      />
    </div>
  );
}

function ModeTab({ selected, onSelect, icon, label }: { selected: boolean; onSelect: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`inline-flex items-center gap-1.5 rounded-button px-2.5 py-1 text-label transition-colors ${selected ? "bg-surface font-medium text-ink shadow-card" : "text-ink-3 hover:text-ink"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function SaveBadge({ status, labels }: { status: SaveStatus; labels: Labels }) {
  const text = { saved: labels.statusSaved, dirty: labels.statusDirty, saving: labels.statusSaving, error: labels.statusError, conflict: labels.statusConflict }[status];
  const tone = status === "error" || status === "conflict" ? "text-danger" : "text-ink-3";
  return (
    <span role="status" data-testid="canvas-status" data-status={status} className={`inline-flex items-center gap-1 text-meta ${tone}`}>
      {status === "saved" && <Check size={13} aria-hidden />}
      {text}
    </span>
  );
}

function ConflictBanner({ labels, canvas }: { labels: Labels; canvas: CanvasController }) {
  const conflict = canvas.editor.conflict;
  if (!conflict) return null;
  const body = conflict.updatedBy === "donna" ? labels.conflictByDonna : labels.conflictByUser;
  return (
    <div role="alertdialog" aria-label={labels.conflictTitle} className="border-b border-border bg-peche-100 px-4 py-3 text-secondary text-brand-strong">
      <p className="font-medium">{labels.conflictTitle}</p>
      <p className="mt-0.5 text-pretty">{fill(body, { n: conflict.currentVersion })}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={canvas.keepMine} className="rounded-button bg-brand-fill px-3 py-1.5 text-label font-medium text-white hover:bg-brand-fill-strong">
          {labels.keepMine}
        </button>
        <button type="button" onClick={canvas.takeTheirs} className="rounded-button bg-surface px-3 py-1.5 text-label font-medium text-ink hover:bg-active">
          {labels.takeTheirs}
        </button>
      </div>
      <p className="mt-1.5 text-meta text-ink-3">{labels.keepMineHint}</p>
    </div>
  );
}

function ExportMenu({ id, labels }: { id: string; labels: Labels }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const names: Record<CanvasExportFormat, string> = { md: labels.exportMd, docx: labels.exportDocx, pdf: labels.exportPdf };
  return (
    <div ref={ref} className="relative">
      <button type="button" className={BUTTON} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} aria-label={labels.export} title={labels.export}>
        <Download size={17} />
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-30 mt-1 w-44 overflow-hidden rounded-panel border border-border bg-surface py-1 shadow-float">
          {EXPORT_FORMATS.map((format) => (
            <a
              key={format}
              role="menuitem"
              href={canvasUrls.export(id, format)}
              download
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-label text-ink no-underline hover:bg-active hover:text-ink"
            >
              {names[format]}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Historique ───────────────────────────────────────────────────────────────

function HistoryView({ labels, canvas, lang, active, onClose }: { labels: Labels; canvas: CanvasController; lang: string; active: CanvasMeta | null; onClose: () => void }) {
  const [items, setItems] = useState<CanvasVersionMeta[] | null | "failed">(null);
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const version = canvas.editor.doc?.version ?? 0;

  // Relu quand le document change (nouvelle version) : la liste suit ce qui se passe.
  useEffect(() => {
    let cancelled = false;
    void canvas.versions().then((list) => !cancelled && setItems(list ?? "failed"));
    return () => {
      cancelled = true;
    };
    // `canvas.versions` est stable ; la version du document est la vraie dépendance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, active?.id]);

  const who = (author: string) => (author === "donna" ? labels.byDonna : labels.byYou);
  const when = (iso: string) => new Intl.DateTimeFormat(lang, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface" role="region" aria-label={labels.history} data-testid="canvas-history">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-label font-medium text-ink">{labels.history}</h3>
        <button type="button" className={BUTTON} onClick={onClose} aria-label={labels.historyClose} title={labels.historyClose}>
          <X size={17} />
        </button>
      </header>
      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
        {items === null && <p className="px-4 py-3 text-secondary text-ink-3">{labels.historyLoading}</p>}
        {items === "failed" && <p role="alert" className="px-4 py-3 text-secondary text-danger">{labels.historyFailed}</p>}
        {Array.isArray(items) && items.length === 0 && <p className="px-4 py-3 text-secondary text-ink-3">{labels.historyEmpty}</p>}
        {restoreFailed && <p role="alert" className="px-4 py-2 text-secondary text-danger">{labels.restoreFailed}</p>}
        {Array.isArray(items) && (
          <ol className="flex flex-col">
            {items.map((item, index) => (
              <li key={item.version} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => setOpenVersion(openVersion === item.version ? null : item.version)}
                  aria-expanded={openVersion === item.version}
                  className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-active/50"
                >
                  <span className="flex items-center gap-2 text-label font-medium text-ink">
                    {fill(labels.versionRow, { n: item.version, who: who(item.author) })}
                    {index === 0 && <span className="rounded-badge bg-brand/10 px-1.5 py-0.5 text-meta font-medium text-brand">{labels.current}</span>}
                  </span>
                  <span className="text-meta text-ink-3">
                    {when(item.created_at)}
                    {item.note ? ` · ${item.note}` : ""}
                  </span>
                </button>
                {openVersion === item.version && (
                  <VersionDetail
                    labels={labels}
                    canvas={canvas}
                    item={item}
                    older={items[index + 1] ?? null}
                    isCurrent={index === 0}
                    onRestore={async () => {
                      setRestoreFailed(false);
                      const ok = await canvas.restore(item.version);
                      if (ok) onClose();
                      else setRestoreFailed(true);
                    }}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function VersionDetail({
  labels,
  canvas,
  item,
  older,
  isCurrent,
  onRestore,
}: {
  labels: Labels;
  canvas: CanvasController;
  item: CanvasVersionMeta;
  older: CanvasVersionMeta | null;
  isCurrent: boolean;
  onRestore: () => void;
}) {
  const [texts, setTexts] = useState<{ now: string; before: string | null } | "failed" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([canvas.versionDoc(item.version), older ? canvas.versionDoc(older.version) : Promise.resolve(null)]).then(([now, before]) => {
      if (cancelled) return;
      setTexts(now ? { now: now.content, before: older ? (before?.content ?? "") : null } : "failed");
    });
    return () => {
      cancelled = true;
    };
    // Les deux versions ne changent jamais : on ne relit que pour un autre couple.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.version, older?.version]);

  const lines = useMemo(() => (texts && texts !== "failed" && texts.before !== null ? diffLines(texts.before, texts.now) : null), [texts]);
  const stats = lines ? diffStats(lines) : null;
  const folded = useMemo(() => (lines ? foldUnchanged(lines, 2) : null), [lines]);

  return (
    <div className="bg-surface px-4 py-3">
      {texts === null && <p className="text-secondary text-ink-3">{labels.changesLoading}</p>}
      {texts === "failed" && <p role="alert" className="text-secondary text-danger">{labels.historyFailed}</p>}
      {texts && texts !== "failed" && texts.before === null && <p className="text-secondary text-ink-3">{labels.changesFirst}</p>}
      {stats && (
        <p className="text-meta text-ink-3">{stats.added + stats.removed === 0 ? labels.changesNone : fill(labels.changesVs, { added: stats.added, removed: stats.removed })}</p>
      )}
      {folded && stats && stats.added + stats.removed > 0 && (
        <pre data-testid="canvas-diff" className="scrollbar-none mt-2 max-h-64 overflow-auto rounded-button border border-border bg-surface py-1 font-mono text-meta leading-5">
          {folded.map((line, index) =>
            line.kind === "gap" ? (
              <span key={index} className="block px-3 text-ink-3">
                {fill(labels.gap, { n: line.count })}
              </span>
            ) : (
              <span
                key={index}
                data-kind={line.kind}
                className={`block px-3 whitespace-pre-wrap break-words ${line.kind === "add" ? "bg-success-soft text-success-ink" : line.kind === "del" ? "bg-danger/[0.07] text-danger line-through" : "text-ink-2"}`}
              >
                {line.kind === "add" ? "+ " : line.kind === "del" ? "− " : "  "}
                {line.text || " "}
              </span>
            ),
          )}
        </pre>
      )}
      {!isCurrent && (
        <button type="button" onClick={onRestore} className="mt-3 rounded-button bg-brand-fill px-3 py-1.5 text-label font-medium text-white hover:bg-brand-fill-strong">
          {labels.restore}
        </button>
      )}
    </div>
  );
}
