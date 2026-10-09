"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { fileHref, type DocumentSearchOut, type SearchHitOut } from "@/lib/workspace-types";
import { ArrowReturnIcon, ChatIcon, ComposeIcon, FileIcon, SearchIcon } from "./icons";
import { useWorkspace } from "./workspace-provider";

type Labels = Dictionary["workspace"]["sidebar"];
type Item = {
  id: string;
  href: string;
  title: string;
  snippet?: string;
  kind: "new" | "title" | "message" | "document";
  /** Document : aperçu dans DONNA (pas de navigation). */
  file?: { url: string; name: string };
  /** Document : projet d'appartenance ou « Personnel », et proximité purement sémantique. */
  origin?: string;
  semantic?: boolean;
};

/**
 * Fenêtre de recherche (Ctrl+K / ⌘K) : nouvelle conversation, titres (filtre
 * local immédiat), contenu des messages ET documents — noms + contenu de la
 * base documentaire (RAG), backend, après 250 ms. Navigation au clavier :
 * ↑ ↓, Entrée, Échap.
 */
export function SearchPalette({ lang, labels }: { lang: Locale; labels: Labels }) {
  const { searchOpen, setSearchOpen, conversations, setPreview } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<{ query: string; hits: SearchHitOut[] } | null>(null);
  const [remoteDocs, setRemoteDocs] = useState<{ query: string; result: DocumentSearchOut | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Raccourci global.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(!searchOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, setSearchOpen]);

  const trimmed = query.trim();
  useEffect(() => {
    if (!searchOpen || trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      // Conversations et documents en parallèle : l'un lent (embeddings) ne retient pas l'autre.
      const conversationsSearch = (async () => {
        try {
          const response = await fetch(`/api/donna/chat/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
          setRemote({ query: trimmed, hits: response.ok ? ((await response.json()) as SearchHitOut[]) : [] });
        } catch {
          // Frappe suivante ou réseau : les titres filtrés localement restent affichés.
        }
      })();
      const documentsSearch = (async () => {
        try {
          const response = await fetch(`/api/donna/chat/search/documents?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
          setRemoteDocs({ query: trimmed, result: response.ok ? ((await response.json()) as DocumentSearchOut) : null });
        } catch {
          // idem
        }
      })();
      await Promise.all([conversationsSearch, documentsSearch]);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchOpen, trimmed]);

  const items = useMemo<Item[]>(() => {
    const q = trimmed.toLocaleLowerCase(lang);
    const titles = (q ? conversations.filter((c) => c.title.toLocaleLowerCase(lang).includes(q)) : conversations)
      .slice(0, q ? 8 : 6)
      .map<Item>((c) => ({ id: c.id, href: `/${lang}/app/c/${c.id}`, title: c.title, kind: "title" }));
    const seen = new Set(titles.map((t) => t.id));
    const messages =
      remote && remote.query === trimmed
        ? remote.hits
            .filter((hit) => hit.matched_in === "message" && !seen.has(hit.conversation_id))
            .map<Item>((hit) => ({ id: hit.conversation_id, href: `/${lang}/app/c/${hit.conversation_id}`, title: hit.title, snippet: hit.snippet, kind: "message" }))
        : [];
    const documents =
      remoteDocs && remoteDocs.query === trimmed && remoteDocs.result
        ? remoteDocs.result.hits.map<Item>((hit) => ({
            id: hit.doc_id,
            href: "",
            title: hit.original_name,
            snippet: hit.excerpt || undefined,
            kind: "document",
            file: { url: fileHref(hit.file_url), name: hit.original_name },
            origin: hit.project_name
              ? labels.searchDocProject.replace("{name}", hit.project_name)
              : hit.conversation_id
                ? labels.searchDocConversation.replace("{title}", hit.conversation_title ?? "…")
                : labels.searchDocPersonal,
            semantic: hit.matched_in === "semantic",
          }))
        : [];
    const create: Item[] = q ? [] : [{ id: "new", href: `/${lang}/app`, title: labels.newChat, kind: "new" }];
    return [...create, ...titles, ...messages, ...documents];
  }, [conversations, remote, remoteDocs, trimmed, lang, labels]);

  if (!searchOpen) return null;

  const close = () => {
    setSearchOpen(false);
    setQuery("");
    setActive(0);
  };
  const open = (item: Item | undefined) => {
    if (!item) return;
    close();
    if (item.file) setPreview(item.file);
    else router.push(item.href);
  };
  const selected = Math.min(active, Math.max(items.length - 1, 0));
  const titles = items.filter((i) => i.kind === "new" || i.kind === "title");
  const messages = items.filter((i) => i.kind === "message");
  const documents = items.filter((i) => i.kind === "document");
  const waiting = trimmed.length >= 2 && (remote?.query !== trimmed || remoteDocs?.query !== trimmed);
  const docsResult = remoteDocs && remoteDocs.query === trimmed ? remoteDocs.result : null;
  // Recherche documentaire dégradée (embeddings en panne) ou indisponible : dit, jamais silencieux.
  const docsNotice =
    trimmed.length < 2 || !remoteDocs || remoteDocs.query !== trimmed
      ? null
      : !docsResult || docsResult.mode === "unavailable"
        ? labels.searchDocsUnavailable
        : docsResult.mode === "keyword"
          ? labels.searchKeywordOnly
          : null;

  const row = (item: Item) => {
    const index = items.indexOf(item);
    const isActive = index === selected;
    return (
      <li key={`${item.kind}-${item.id}`} id={`${listId}-${index}`} role="option" aria-selected={isActive}>
        <button
          type="button"
          onMouseEnter={() => setActive(index)}
          onClick={() => open(item)}
          className={`flex w-full items-center gap-3 rounded-nav px-3 py-2.5 text-left ${isActive ? "bg-active" : ""}`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-badge bg-surface text-ink-2">
            {item.kind === "new" ? <ComposeIcon size={16} /> : item.kind === "document" ? <FileIcon size={16} className="text-brand" /> : <ChatIcon size={16} />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-label text-ink">{item.title}</span>
              {item.origin && <span className="shrink-0 text-meta text-ink-3">{item.origin}</span>}
              {item.semantic && <span className="shrink-0 rounded-full bg-surface px-1.5 text-meta text-ink-3">{labels.searchSemantic}</span>}
            </span>
            {item.snippet && <span className="line-clamp-1 text-meta text-ink-3">{item.snippet}</span>}
          </span>
          {isActive && <ArrowReturnIcon size={16} className="shrink-0 text-ink-3" />}
        </button>
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 px-4 pt-[12vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.searchLabel}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-[36rem] overflow-hidden rounded-panel bg-surface shadow-float"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <SearchIcon size={18} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items.length ? `${listId}-${selected}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
              else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => Math.min(i + 1, items.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                open(items[selected]);
              }
            }}
            placeholder={labels.searchPlaceholder}
            className="h-14 min-w-0 flex-1 bg-transparent text-message text-ink outline-none placeholder:text-ink-3 focus-visible:shadow-none"
          />
          <kbd className="rounded-badge border border-border px-1.5 font-sans text-meta text-ink-3">Esc</kbd>
        </div>

        <div className="scrollbar-none max-h-[55vh] overflow-y-auto p-2">
          <ul id={listId} role="listbox" aria-label={labels.searchLabel} className="flex flex-col gap-px">
            {titles.length > 0 && trimmed && <li role="presentation" className="px-3 pt-1 pb-1.5 text-meta text-ink-3">{labels.searchTitles}</li>}
            {titles.map(row)}
            {messages.length > 0 && <li role="presentation" className="px-3 pt-3 pb-1.5 text-meta text-ink-3">{labels.inMessages}</li>}
            {messages.map(row)}
            {documents.length > 0 && <li role="presentation" className="px-3 pt-3 pb-1.5 text-meta text-ink-3">{labels.searchDocuments}</li>}
            {documents.map(row)}
          </ul>
          {docsNotice && <p className="px-3 py-2 text-meta text-danger">{docsNotice}</p>}
          {!items.length && (
            <p className="px-3 py-6 text-center text-secondary text-ink-3">
              {trimmed.length < 2 ? labels.searchEmpty : waiting ? labels.searching : labels.searchNone}
            </p>
          )}
        </div>
        <p className="border-t border-border px-4 py-2 text-meta text-ink-3">{labels.searchHint}</p>
      </div>
    </div>
  );
}
