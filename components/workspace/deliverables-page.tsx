"use client";

import Link from "next/link";
import { FolderOpen, RotateCw } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import {
  conversationHref,
  deliverablesUrl,
  extensionOf,
  fileUrl,
  hasMore,
  mergePages,
  queryKey,
  SEARCH_DEBOUNCE_MS,
  type DeliverableCanvas,
  type DeliverableFile,
  type Deliverables,
  type KindFilter,
} from "@/lib/deliverables";
import { parseBackendDate } from "@/lib/workspace-types";
import { FileLink } from "./file-viewer";
import { ChevronIcon, FileIcon } from "./icons";

type Labels = Dictionary["workspace"]["deliverables"];

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

const KINDS: KindFilter[] = ["all", "document", "image"];

/** Page « Mes livrables » : les fichiers que DONNA a produits pour l'utilisateur et ses documents partagés, toutes conversations
 *  confondues. Le serveur ne liste que ce qui est à lui ; le téléchargement passe par la route des pièces jointes. */
export function DeliverablesPage({ lang, labels }: { lang: Locale; labels: Labels }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [abandoned, setAbandoned] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const searchId = useId();

  // La recherche part 300 ms après la dernière frappe (setState dans le rappel du minuteur, pas dans le corps de l'effet).
  useEffect(() => {
    const timer = setTimeout(() => setQ(input), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const key = queryKey({ q, kind, abandoned });
  // Résultats étiquetés par la recherche qui les a produits : « en cours » se déduit (result.key !== key) et un résultat tardif
  // d'une recherche précédente ne s'affiche jamais à la place de la courante.
  const [result, setResult] = useState<{ key: string; data: Deliverables | null } | null>(null);
  const [more, setMore] = useState<{ key: string; files: DeliverableFile[]; failed: boolean } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(deliverablesUrl({ q, kind, abandoned }), { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<Deliverables>) : null))
      .catch(() => null)
      .then((data) => {
        if (!cancelled) setResult({ key, data });
      });
    return () => {
      cancelled = true;
    };
  }, [key, q, kind, abandoned, reloadToken]);

  const loading = result?.key !== key;
  const data = loading ? null : (result?.data ?? null);
  const failed = !loading && data === null;
  const extra = more?.key === key ? more : null;
  const files = useMemo(() => (data ? mergePages(data.files, extra?.files ?? []) : []), [data, extra]);

  const loadMore = async () => {
    if (!data || moreBusy) return;
    setMoreBusy(true);
    try {
      const response = await fetch(deliverablesUrl({ q, kind, abandoned, offset: files.length }), { cache: "no-store" });
      const page = response.ok ? ((await response.json()) as Deliverables) : null;
      setMore((current) => ({
        key,
        files: page ? mergePages(current?.key === key ? current.files : [], page.files) : (current?.key === key ? current.files : []),
        failed: !page,
      }));
    } catch {
      setMore((current) => ({ key, files: current?.key === key ? current.files : [], failed: true }));
    } finally {
      setMoreBusy(false);
    }
  };

  const retry = () => {
    setResult(null);
    setReloadToken((prev) => prev + 1);
  };

  const filtering = q.trim() !== "" || kind !== "all" || abandoned;
  const empty = data !== null && files.length === 0 && data.canvases.length === 0;

  return (
    <div className="scrollbar-none flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[56rem] flex-col gap-6 px-4 py-8 md:px-8">
        <nav className="flex items-center gap-1.5 text-label text-ink-3">
          <Link href={`/${lang}/app`} className="no-underline hover:text-ink">
            {labels.homeLabel}
          </Link>
          <ChevronIcon size={12} className="-rotate-90" />
          <span className="font-medium text-ink-2">{labels.indexTitle}</span>
        </nav>

        <div className="flex max-w-[36rem] flex-col gap-1">
          <h1 className="text-hero-sm font-medium text-ink">{labels.indexTitle}</h1>
          <p className="text-secondary text-ink-3 text-pretty">{labels.subtitle}</p>
        </div>

        <DeliverablesFilters
          searchId={searchId}
          input={input}
          onInputChange={setInput}
          kind={kind}
          onKindChange={setKind}
          abandoned={abandoned}
          onAbandonedChange={setAbandoned}
          labels={labels}
        />

        {failed ? (
          <DeliverablesErrorState labels={labels} onRetry={retry} />
        ) : !data ? (
          <p className="py-10 text-center text-secondary text-ink-3">{labels.loading}</p>
        ) : empty ? (
          <DeliverablesEmptyState labels={labels} filtering={filtering} />
        ) : (
          <>
            {data.canvases.length > 0 && (
              <section aria-labelledby={`${searchId}-canvases`} className="rounded-panel bg-surface shadow-card">
                <h2 id={`${searchId}-canvases`} className="px-4 pt-3 pb-2 text-label font-medium text-ink">
                  {labels.canvasesTitle}
                </h2>
                <ul className="flex flex-col border-t border-border">
                  {data.canvases.map((canvas) => (
                    <CanvasRow key={canvas.id} lang={lang} labels={labels} canvas={canvas} />
                  ))}
                </ul>
              </section>
            )}

            {files.length > 0 && (
              <section aria-labelledby={`${searchId}-files`} className="rounded-panel bg-surface shadow-card">
                <h2 id={`${searchId}-files`} className="flex items-baseline justify-between gap-2 px-4 pt-3 pb-2 text-label font-medium text-ink">
                  {labels.filesTitle}
                  <span className="text-meta font-normal text-ink-3">{fill(labels.filesCount, { n: data.total })}</span>
                </h2>
                <ul className="flex flex-col border-t border-border">
                  {files.map((file) => (
                    <FileRow key={file.id} lang={lang} labels={labels} file={file} />
                  ))}
                </ul>
                {hasMore(data.total, files.length) && (
                  <div className="flex flex-col items-center gap-2 border-t border-border px-4 py-3">
                    {extra?.failed && (
                      <p role="alert" className="text-meta text-danger">
                        {labels.loadError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      disabled={moreBusy}
                      className="rounded-button px-4 py-1.5 text-label font-medium text-ink hover:bg-active disabled:opacity-60"
                    >
                      {moreBusy ? labels.loadingMore : labels.loadMore}
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DeliverablesFilters({
  searchId,
  input,
  onInputChange,
  kind,
  onKindChange,
  abandoned,
  onAbandonedChange,
  labels,
}: {
  searchId: string;
  input: string;
  onInputChange: (val: string) => void;
  kind: KindFilter;
  onKindChange: (kind: KindFilter) => void;
  abandoned: boolean;
  onAbandonedChange: (val: boolean) => void;
  labels: Labels;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor={searchId} className="sr-only">
          {labels.searchLabel}
        </label>
        <input
          id={searchId}
          type="search"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={labels.searchPlaceholder}
          className="h-9 w-full rounded-button border border-border bg-surface px-3 text-secondary text-ink outline-none focus:border-brand"
        />
      </div>
      <div role="group" aria-label={labels.filterLabel} className="inline-flex rounded-button bg-fill p-0.5">
        {KINDS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={kind === option}
            onClick={() => onKindChange(option)}
            className={`rounded-badge px-3 py-1.5 text-label ${
              kind === option ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink"
            }`}
          >
            {{ all: labels.filterAll, document: labels.filterDocuments, image: labels.filterImages }[option]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-label text-ink-2">
        <input type="checkbox" checked={abandoned} onChange={(event) => onAbandonedChange(event.target.checked)} className="size-4 accent-brand" />
        {labels.showAbandoned}
      </label>
    </div>
  );
}

function DeliverablesErrorState({ labels, onRetry }: { labels: Labels; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-panel bg-surface px-5 py-8 text-center shadow-card">
      <p className="text-message text-danger">{labels.loadError}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-button bg-fill px-3 py-1.5 text-label font-medium text-ink hover:bg-active"
      >
        <RotateCw size={14} />
        <span>Réessayer</span>
      </button>
    </div>
  );
}

function DeliverablesEmptyState({ labels, filtering }: { labels: Labels; filtering: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-panel border-2 border-dashed border-border bg-fill/40 px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-peche-100 text-brand">
        <FolderOpen size={18} />
      </span>
      <p className="text-label font-medium text-ink">{filtering ? labels.emptySearch : labels.empty}</p>
      {!filtering && <p className="max-w-[30rem] text-secondary text-ink-3 text-pretty">{labels.emptyHint}</p>}
    </div>
  );
}

function when(lang: string, iso: string): string {
  const time = parseBackendDate(iso);
  return time === null ? "" : new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(time));
}

function FileRow({ lang, labels, file }: { lang: Locale; labels: Labels; file: DeliverableFile }) {
  const extension = extensionOf(file.name);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-button bg-fill text-ink-3">
        {file.kind === "image" ? (
          // Même origine (l'API de DONNA, avec le cookie de session) : aucune image n'est chargée depuis un site externe.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(file.id)} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <FileIcon size={18} />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <FileLink url={fileUrl(file.id)} name={file.name} className="truncate text-label font-medium text-ink no-underline hover:text-brand">
          {file.name}
        </FileLink>
        <p className="flex flex-wrap items-center gap-x-2 text-meta text-ink-3">
          {extension && <span className="rounded-badge bg-fill px-1.5 py-px font-medium">{extension}</span>}
          <span>{when(lang, file.created_at)}</span>
          <Link href={conversationHref(lang, file.conversation_id)} className="truncate no-underline hover:text-brand hover:underline">
            {fill(labels.inConversation, { title: file.conversation_title })}
          </Link>
          {!file.on_shown_branch && <span className="rounded-badge bg-peche-100 px-1.5 py-px text-brand-strong">{labels.abandoned}</span>}
        </p>
      </div>
      <a
        href={fileUrl(file.id)}
        download={file.name}
        className="shrink-0 rounded-button px-3 py-1.5 text-label font-medium text-ink-2 no-underline hover:bg-active hover:text-brand"
      >
        {labels.download}
      </a>
    </li>
  );
}

function CanvasRow({ lang, labels, canvas }: { lang: Locale; labels: Labels; canvas: DeliverableCanvas }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-button bg-fill text-ink-3">
        <FileIcon size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link href={conversationHref(lang, canvas.conversation_id)} className="truncate text-label font-medium text-ink no-underline hover:text-brand">
          {canvas.title}
        </Link>
        <p className="flex flex-wrap items-center gap-x-2 text-meta text-ink-3">
          <span>{fill(labels.canvasVersion, { n: canvas.version })}</span>
          <span>{canvas.updated_by === "donna" ? labels.editedByDonna : labels.editedByYou}</span>
          <span>{when(lang, canvas.updated_at)}</span>
          <span className="truncate">{fill(labels.inConversation, { title: canvas.conversation_title })}</span>
        </p>
      </div>
    </li>
  );
}
