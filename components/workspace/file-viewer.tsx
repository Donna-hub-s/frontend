"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import { Dialog, DialogHeader } from "./dialog";
import { DownloadIcon, FileIcon } from "./icons";
import { Markdown } from "./markdown";
import { useWorkspace, type FilePreview } from "./workspace-provider";

type Labels = Dictionary["workspace"]["viewer"];

/** Au-delà, pas d'aperçu : le téléchargement reste proposé. */
const MAX_PREVIEW_BYTES = 20 * 1_048_576;
const MAX_TEXT_CHARS = 400_000;
const MAX_SHEET_ROWS = 1_000;

type Kind = "pdf" | "image" | "docx" | "xlsx" | "csv" | "markdown" | "text" | "other";

const EXTENSIONS: Record<string, Kind> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  svg: "image",
  docx: "docx",
  xlsx: "xlsx",
  xlsm: "xlsx",
  csv: "csv",
  tsv: "csv",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  log: "text",
  json: "text",
  xml: "text",
  html: "text",
  htm: "text",
  yaml: "text",
  yml: "text",
};

export function previewKind(name: string): Kind {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSIONS[extension] ?? "other";
}

type Sheet = { name: string; rows: string[][]; total: number };

type Content =
  | { kind: "pdf" | "image"; url: string }
  | { kind: "docx"; html: string }
  | { kind: "sheets"; sheets: Sheet[] }
  | { kind: "markdown" | "text"; text: string; truncated: boolean }
  | { kind: "other" };

type State = { status: "loading" } | { status: "error"; reason: "load" | "tooLarge" | "parse" } | { status: "ready"; content: Content };

/** Fenêtre d'aperçu : PDF, images, Word, Excel, CSV, Markdown et texte, sans quitter DONNA. */
export function FileViewer({ lang, labels }: { lang: Locale; labels: Labels }) {
  const { preview, setPreview } = useWorkspace();
  return (
    <Dialog open={preview !== null} onClose={() => setPreview(null)} label={preview?.name ?? labels.title} className="flex h-[min(52rem,calc(100dvh-2rem))] max-w-[60rem] flex-col">
      {preview && <ViewerBody key={preview.url} lang={lang} labels={labels} file={preview} onClose={() => setPreview(null)} />}
    </Dialog>
  );
}

function ViewerBody({ lang, labels, file, onClose }: { lang: Locale; labels: Labels; file: FilePreview; onClose: () => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const kind = previewKind(file.name);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;

    (async () => {
      if (kind === "other") return setState({ status: "ready", content: { kind: "other" } });
      let blob: Blob;
      try {
        const response = await fetch(file.url, { signal: controller.signal });
        if (!response.ok) return setState({ status: "error", reason: "load" });
        const length = Number(response.headers.get("content-length") ?? 0);
        if (length > MAX_PREVIEW_BYTES) return setState({ status: "error", reason: "tooLarge" });
        blob = await response.blob();
      } catch {
        if (!controller.signal.aborted) setState({ status: "error", reason: "load" });
        return;
      }
      if (blob.size > MAX_PREVIEW_BYTES) return setState({ status: "error", reason: "tooLarge" });

      try {
        const content = await render(kind, blob, lang);
        if (content.kind === "pdf" || content.kind === "image") objectUrl = content.url;
        if (!controller.signal.aborted) setState({ status: "ready", content });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error", reason: "parse" });
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.url, kind, lang]);

  return (
    <>
      <DialogHeader title={file.name} subtitle={labels.kinds[kind]} closeLabel={labels.close} onClose={onClose}>
        <a
          href={file.url}
          download={file.name}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-button border border-border px-2.5 py-1.5 text-meta font-medium text-ink no-underline hover:border-bordeaux-700/40 hover:text-bordeaux-900"
        >
          <DownloadIcon size={15} />
          {labels.download}
        </a>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-auto bg-page">
        {state.status === "loading" && <p className="p-8 text-center text-secondary text-ink-3">{labels.loading}</p>}
        {state.status === "error" && (
          <Fallback message={state.reason === "tooLarge" ? labels.tooLarge : state.reason === "parse" ? labels.parseError : labels.loadError} />
        )}
        {state.status === "ready" && <Rendered labels={labels} content={state.content} name={file.name} />}
      </div>
    </>
  );
}

function Fallback({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-card bg-surface text-bordeaux-700 shadow-card">
        <FileIcon size={22} />
      </span>
      <p className="max-w-sm text-secondary text-ink-2 text-pretty">{message}</p>
    </div>
  );
}

function Rendered({ labels, content, name }: { labels: Labels; content: Content; name: string }) {
  switch (content.kind) {
    case "pdf":
      return <iframe src={content.url} title={name} className="size-full border-0 bg-surface" />;
    case "image":
      return (
        <div className="flex min-h-full items-center justify-center p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob local, pas d'optimisation possible */}
          <img src={content.url} alt={name} className="max-h-full max-w-full rounded-card bg-surface object-contain shadow-card" />
        </div>
      );
    case "docx":
      return (
        <div className="px-4 py-6 md:px-8">
          <article className="doc-preview mx-auto max-w-[46rem] rounded-card bg-surface px-6 py-8 shadow-card md:px-12 md:py-10" dangerouslySetInnerHTML={{ __html: content.html }} />
        </div>
      );
    case "sheets":
      return <Sheets labels={labels} sheets={content.sheets} />;
    case "markdown":
      return (
        <div className="px-4 py-6 md:px-8">
          <article className="mx-auto max-w-[46rem] rounded-card bg-surface px-6 py-8 text-ink shadow-card md:px-12">
            <Markdown reading>{content.text}</Markdown>
            {content.truncated && <p className="mt-4 text-meta text-ink-3">{labels.truncatedText}</p>}
          </article>
        </div>
      );
    case "text":
      return (
        <div className="p-4">
          <pre className="overflow-x-auto rounded-card bg-surface p-5 font-mono text-[0.8125rem] leading-6 whitespace-pre-wrap text-ink shadow-card">{content.text}</pre>
          {content.truncated && <p className="mt-3 text-meta text-ink-3">{labels.truncatedText}</p>}
        </div>
      );
    default:
      return <Fallback message={labels.unsupported} />;
  }
}

function Sheets({ labels, sheets }: { labels: Labels; sheets: Sheet[] }) {
  const [active, setActive] = useState(0);
  const sheet = sheets[active] ?? sheets[0];
  if (!sheet) return <Fallback message={labels.emptySheet} />;
  const width = Math.max(1, ...sheet.rows.map((row) => row.length));

  return (
    <div className="flex h-full flex-col">
      {sheets.length > 1 && (
        <div role="tablist" aria-label={labels.sheets} className="scrollbar-none flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface px-3 pt-2">
          {sheets.map((s, index) => (
            <button
              key={s.name}
              role="tab"
              type="button"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={`-mb-px shrink-0 rounded-t-button border-b-2 px-3 py-2 text-label ${
                index === active ? "border-bordeaux-700 font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {!sheet.rows.length ? (
        <Fallback message={labels.emptySheet} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 bg-surface text-secondary tabular-nums">
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={r} className={r === 0 ? "sticky top-0 z-10 bg-surface font-medium" : ""}>
                  <th scope="row" className="sticky left-0 border-r border-b border-border bg-surface px-2 py-1.5 text-right text-meta font-normal text-ink-3">
                    {r + 1}
                  </th>
                  {Array.from({ length: width }, (_, c) => (
                    <td key={c} className="max-w-[22rem] truncate border-r border-b border-border px-3 py-1.5 whitespace-nowrap text-ink" title={row[c] ?? ""}>
                      {row[c] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {sheet.total > sheet.rows.length && (
            <p className="px-4 py-3 text-meta text-ink-3">{labels.truncatedRows.replace("{n}", String(sheet.rows.length))}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Rendu par type ─────────────────────────────────────────────────────────────── */

async function render(kind: Kind, blob: Blob, lang: Locale): Promise<Content> {
  switch (kind) {
    case "pdf":
      // Type imposé : le visualiseur PDF du navigateur ne s'ouvre que sur application/pdf.
      return { kind: "pdf", url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })) };
    case "image":
      // Un SVG affiché via <img> n'exécute aucun script.
      return { kind: "image", url: URL.createObjectURL(blob) };
    case "docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
      return { kind: "docx", html: sanitizeHtml(value) };
    }
    case "xlsx": {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const sheets = await readXlsxFile(blob);
      const formulas = await unevaluatedFormulas(blob);
      const format = cellFormatter(lang);
      return {
        kind: "sheets",
        sheets: sheets.map(({ sheet, data }) => {
          const rows = data.map((row) => row.map(format));
          for (const [row, column, formula] of formulas.get(sheet) ?? []) {
            while (rows.length <= row) rows.push([]);
            if (!rows[row][column]) rows[row][column] = formula;
          }
          return { name: sheet, total: rows.length, rows: rows.slice(0, MAX_SHEET_ROWS).map((row) => Array.from(row, (cell) => cell ?? "")) };
        }),
      };
    }
    case "csv": {
      const text = await blob.text();
      const rows = parseDelimited(text.slice(0, MAX_TEXT_CHARS));
      return { kind: "sheets", sheets: [{ name: "CSV", total: rows.length, rows: rows.slice(0, MAX_SHEET_ROWS) }] };
    }
    case "markdown":
    case "text": {
      const text = await blob.text();
      return { kind, text: text.slice(0, MAX_TEXT_CHARS), truncated: text.length > MAX_TEXT_CHARS };
    }
    default:
      return { kind: "other" };
  }
}

/**
 * Formules sans valeur calculée (fichiers écrits par openpyxl, dont ceux de
 * DONNA : Excel calcule à l'ouverture, pas l'aperçu). Sans ce relevé, la
 * cellule paraîtrait vide ; on affiche la formule à la place.
 * Résultat : nom de feuille → [ligne, colonne, "=FORMULE"] (indices à partir de 0).
 */
async function unevaluatedFormulas(blob: Blob): Promise<Map<string, [number, number, string][]>> {
  const found = new Map<string, [number, number, string][]>();
  try {
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()), {
      filter: (file) => file.name === "xl/workbook.xml" || file.name === "xl/_rels/workbook.xml.rels" || file.name.startsWith("xl/worksheets/sheet"),
    });
    const xml = (name: string) => (files[name] ? new DOMParser().parseFromString(strFromU8(files[name]), "application/xml") : null);
    const workbook = xml("xl/workbook.xml");
    const rels = xml("xl/_rels/workbook.xml.rels");
    if (!workbook || !rels) return found;
    const targets = new Map([...rels.getElementsByTagName("Relationship")].map((r) => [r.getAttribute("Id"), r.getAttribute("Target") ?? ""]));
    for (const sheet of workbook.getElementsByTagName("sheet")) {
      const target = targets.get(sheet.getAttribute("r:id") ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
      const doc = target ? xml(target.startsWith("/") ? target.slice(1) : `xl/${target}`) : null;
      if (!doc) continue;
      const cells: [number, number, string][] = [];
      for (const cell of doc.getElementsByTagName("c")) {
        const formula = cell.getElementsByTagName("f")[0]?.textContent;
        const value = cell.getElementsByTagName("v")[0]?.textContent;
        const address = /^([A-Z]+)(\d+)$/.exec(cell.getAttribute("r") ?? "");
        if (!formula || value || !address) continue;
        const column = [...address[1]].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
        cells.push([Number(address[2]) - 1, column, `=${formula}`]);
      }
      if (cells.length) found.set(sheet.getAttribute("name") ?? "", cells);
    }
  } catch {
    // Relevé facultatif : sans lui, l'aperçu reste celui des valeurs.
  }
  return found;
}

function cellFormatter(lang: Locale) {
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 10 });
  const date = new Intl.DateTimeFormat(lang, { dateStyle: "medium" });
  return (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return date.format(value);
    if (typeof value === "number") return number.format(value);
    if (typeof value === "boolean") return value ? "VRAI" : "FAUX";
    return String(value);
  };
}

/** CSV/TSV : séparateur deviné sur la première ligne, guillemets doublés gérés. */
function parseDelimited(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") >>> 0);
  const counts = [",", ";", "\t"].map((sep) => [sep, firstLine.split(sep).length] as const);
  const separator = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

/* ── Filtrage du HTML produit par mammoth ─────────────────────────────────────── */

const ALLOWED_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "sub", "sup",
  "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th", "br", "a", "img", "blockquote", "pre", "code",
]);
const SAFE_HREF = /^(https?:|mailto:|#)/i;
const SAFE_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

/**
 * Le .docx peut venir de n'importe où (pièce jointe, document partagé) : liste
 * blanche de balises et d'attributs, aucun lien javascript:, aucune image distante.
 * DOMParser n'exécute ni script ni gestionnaire d'événement.
 */
export function sanitizeHtml(html: string): string {
  const source = new DOMParser().parseFromString(html, "text/html");
  const target = document.implementation.createHTMLDocument("");

  const copy = (node: Node, parent: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(target.createTextNode(node.textContent ?? ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Balise inconnue : on garde son texte, sauf contenu actif.
      if (tag !== "script" && tag !== "style" && tag !== "iframe" && tag !== "object") element.childNodes.forEach((child) => copy(child, parent));
      return;
    }
    const clean = target.createElement(tag);
    if (tag === "a") {
      const href = element.getAttribute("href") ?? "";
      if (SAFE_HREF.test(href)) {
        clean.setAttribute("href", href);
        if (!href.startsWith("#")) {
          clean.setAttribute("target", "_blank");
          clean.setAttribute("rel", "noopener noreferrer nofollow");
        }
      }
    } else if (tag === "img") {
      const src = element.getAttribute("src") ?? "";
      if (!SAFE_IMAGE.test(src)) return;
      clean.setAttribute("src", src);
      clean.setAttribute("alt", element.getAttribute("alt") ?? "");
    } else if (tag === "td" || tag === "th") {
      for (const attribute of ["colspan", "rowspan"]) {
        const value = element.getAttribute(attribute);
        if (value && /^\d{1,3}$/.test(value)) clean.setAttribute(attribute, value);
      }
    }
    element.childNodes.forEach((child) => copy(child, clean));
    parent.appendChild(clean);
  };

  const container = target.createElement("div");
  source.body.childNodes.forEach((child) => copy(child, container));
  return container.innerHTML;
}

/**
 * Lien vers un fichier : clic simple = aperçu dans DONNA ; Ctrl/⌘/Maj-clic ou
 * clic du milieu gardent le comportement du navigateur (téléchargement, onglet).
 */
export function FileLink({ url, name, className, title, children }: { url: string; name: string; className?: string; title?: string; children: ReactNode }) {
  const { setPreview } = useWorkspace();
  return (
    <a
      href={url}
      title={title}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        setPreview({ url, name });
      }}
      className={className}
    >
      {children}
    </a>
  );
}
