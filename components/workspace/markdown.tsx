"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Pluggable, PluggableList } from "unified";
import "katex/dist/katex.min.css";
import { imageTarget, linkTarget } from "@/lib/file-links";
import { hasMath, normalizeMath } from "@/lib/markdown-math";
import { codeLanguage, nodeText } from "@/lib/markdown-text";
import { CheckIcon, CopyIcon } from "./icons";
import { isBareUrlLink, LinkCard, linkCardData } from "./link-card";

/** Textes des boutons du rendu (fournis une fois par l'espace de travail ; anglais par défaut). */
export type MarkdownLabels = { copy: string; copied: string; linkOpen: string; linkCancel: string; linkConfirmHint: string; linkPreviewError: string };
const MarkdownLabelsContext = createContext<MarkdownLabels>({
  copy: "Copy",
  copied: "Copied",
  linkOpen: "Open",
  linkCancel: "Cancel",
  linkConfirmHint: "You're about to leave DONNA for an external site.",
  linkPreviewError: "Preview unavailable.",
});
export const MarkdownLabelsProvider = MarkdownLabelsContext.Provider;

/** Copie dans le presse-papiers ; repli sur une zone de texte cachée (contexte non sécurisé, ancien navigateur). */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

function CodeBlock({ node, children }: { node?: unknown; children?: ReactNode }) {
  const labels = useContext(MarkdownLabelsContext);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const language = codeLanguage(node);
  return (
    <div className="my-3 overflow-hidden rounded-card bg-active">
      <div className="flex items-center justify-between gap-3 px-4 pt-2 text-meta text-ink-3">
        <span className="font-mono">{language ?? ""}</span>
        <button
          type="button"
          aria-label={copied ? labels.copied : labels.copy}
          onClick={async () => {
            if (!(await copyToClipboard(nodeText(node).replace(/\n$/, "")))) return;
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1800);
          }}
          className="inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-ink-2 hover:bg-fill hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bordeaux-700"
        >
          {copied ? <CheckIcon size={14} className="text-success" /> : <CopyIcon size={14} />}
          <span aria-live="polite">{copied ? labels.copied : labels.copy}</span>
        </button>
      </div>
      <pre className="donna-code overflow-x-auto px-4 pt-1 pb-4 leading-6">{children}</pre>
    </div>
  );
}

/** Un paragraphe réduit à un seul lien « nu » (le texte EST l'URL) devient une
 * carte ; c'est la forme que prend une source citée par DONNA. On inspecte le
 * nœud hast plutôt que les children React : c'est structurel, et insensible à
 * la façon dont react-markdown découpe le texte. */
function bareUrlHref(node: unknown): string | undefined {
  const children = (node as { children?: unknown[] } | undefined)?.children;
  if (!Array.isArray(children) || children.length !== 1) return undefined;
  const child = children[0] as { type?: string; tagName?: string; properties?: { href?: string }; children?: unknown[] } | undefined;
  if (child?.type !== "element" || child.tagName !== "a") return undefined;
  const href = child.properties?.href;
  // Le texte visible doit être l'URL elle-même, pas un titre ancré dessus.
  const text = (child.children ?? [])
    .map((c) => (c as { value?: string }).value ?? "")
    .join("")
    .trim();
  return isBareUrlLink(href, text) ? href : undefined;
}

// Rendu des réponses de DONNA. Pas de HTML brut (react-markdown l'ignore par défaut) :
// le contenu vient d'un modèle et peut refléter des données externes (emails, pages web).

const components: Components = {
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-rose-300">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:text-ink-3">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  h1: ({ children }) => <h3 className="mt-5 mb-2 text-panel-title font-semibold text-ink first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-5 mb-2 text-panel-title font-semibold text-ink first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-4 mb-1.5 text-message font-semibold text-ink first:mt-0">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-rose-300 pl-4 text-ink-2">{children}</blockquote>,
  code: ({ children, className }) =>
    className ? (
      <code className={`${className} font-mono text-[0.8125rem]`}>{children}</code>
    ) : (
      <code className="rounded-badge bg-active px-1.5 py-0.5 font-mono text-[0.8125rem]">{children}</code>
    ),
  pre: ({ children, node }) => <CodeBlock node={node}>{children}</CodeBlock>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-card border border-border">
      <table className="w-full border-collapse text-left text-label">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border bg-active px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top last:border-b-0">{children}</td>,
  hr: () => <hr className="my-5 border-border" />,
};

/** Texte brut d'un lien (ses enfants React) : sert à retrouver un fichier par son nom. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

const linkClass = "underline decoration-rose-300 underline-offset-2";

// react-markdown remplace par une chaîne vide toute URL au schéma inconnu (« sandbox: » inclus) ; un lien
// vide rouvrait l'application. On garde donc la cible brute dans `href` et `src` UNIQUEMENT pour la lire : le rendu
// ci-dessous ne la réutilise que si c'est http(s)/mailto: (lien), sinon il la remplace par le fichier joint ou du texte.
// Une image externe n'est jamais chargée (voir imageTarget).
const keepTarget = (url: string, key: string) => (key === "href" || key === "src" ? url : defaultUrlTransform(url));

export type MarkdownFile = { name: string; url: string };

const MATH_REHYPE: Pluggable = [rehypeKatex, { throwOnError: false, strict: "ignore", trust: false }];
const CODE_REHYPE: Pluggable = [rehypeHighlight, { detect: false, ignoreMissing: true }];
// Le dollar seul n'ouvre PAS une formule (« $5 et $10 ») : voir lib/markdown-math.ts.
const MATH_REMARK: Pluggable = [remarkMath, { singleDollarTextMath: false }];
const BREAKS_REMARK: Pluggable = remarkBreaks;

/**
 * `files` : les pièces jointes du message. Un lien ou une image qui vise l'un d'eux (par son nom) s'ouvre via
 * `renderFile` (aperçu dans DONNA). Fourni par l'appelant plutôt que importé : le visualiseur de fichiers rend
 * lui-même du Markdown, un import direct ferait un cycle.
 * `streaming` : pendant le flux, ni coloration du code ni formules (une formule à moitié écrite clignoterait en
 * erreur, et recolorier à chaque jeton coûterait cher) ; ils apparaissent quand la réponse est complète.
 */
export function Markdown({
  children,
  files = [],
  renderFile,
  streaming = false,
  conversationId,
  breaks = false,
}: {
  children: string;
  files?: readonly MarkdownFile[];
  renderFile?: (file: MarkdownFile, label: ReactNode, variant: "link" | "image") => ReactNode;
  streaming?: boolean;
  /** Pour l'aperçu d'un lien cité (voir LinkCard) : sans conversation, pas d'aperçu possible
   * (le backend vérifie que le lien est déjà visible dans CETTE conversation). */
  conversationId?: string | null;
  /** Saut de ligne saisi = saut de ligne affiché (« remark-breaks ») : le message d'un utilisateur est tapé
   * dans un champ multiligne, et un retour à la ligne perdu change ce qu'il a voulu écrire. */
  breaks?: boolean;
}) {
  const labels = useContext(MarkdownLabelsContext);
  const withMath = !streaming && hasMath(children);
  const withCode = !streaming && /^ {0,3}(```|~~~)/m.test(children);
  const text = useMemo(() => (withMath ? normalizeMath(children) : children), [children, withMath]);
  const remarkPlugins = useMemo<PluggableList>(
    () => [remarkGfm, ...(breaks ? [BREAKS_REMARK] : []), ...(withMath ? [MATH_REMARK] : [])],
    [breaks, withMath],
  );
  const rehypePlugins = useMemo<PluggableList>(() => [...(withCode ? [CODE_REHYPE] : []), ...(withMath ? [MATH_REHYPE] : [])], [withCode, withMath]);
  const merged = useMemo<Components>(
    () => ({
      ...components,
      p: ({ children: label, node }) => {
        const href = bareUrlHref(node);
        const card = linkCardData(href);
        if (card) return <LinkCard data={card} confirm preview={Boolean(conversationId)} conversationId={conversationId ?? undefined} labels={labels} />;
        return <p className="my-3 first:mt-0 last:mb-0">{label}</p>;
      },
      a: ({ href, children: label }) => {
        const target = linkTarget(href, textOf(label), renderFile ? files : []);
        if (target.kind === "file" && renderFile) return <>{renderFile(target.file, label, "link")}</>;
        if (target.kind === "external") {
          return (
            <a href={target.href} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>
              {label}
            </a>
          );
        }
        return <span>{label}</span>;
      },
      img: ({ src, alt }) => {
        const label = alt ?? "";
        const target = imageTarget(typeof src === "string" ? src : undefined, label, renderFile ? files : []);
        if (target.kind === "image" && renderFile) {
          // eslint-disable-next-line @next/next/no-img-element -- fichier du message servi par la passerelle, taille inconnue
          return <>{renderFile(target.file, <img src={target.file.url} alt={label || target.file.name} loading="lazy" className="max-h-72 rounded-card border border-border" />, "image")}</>;
        }
        if (target.kind === "file" && renderFile) return <>{renderFile(target.file, label || target.file.name, "link")}</>;
        if (target.kind === "link") {
          return (
            <a href={target.href} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>
              {label || target.href}
            </a>
          );
        }
        return <span>{label}</span>;
      },
    }),
    [files, renderFile, conversationId, labels],
  );
  return (
    <div className="text-message text-ink [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={merged} urlTransform={keepTarget}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
