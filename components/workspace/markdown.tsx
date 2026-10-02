"use client";

import { useMemo, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { linkTarget } from "@/lib/file-links";
import { isBareUrlLink, LinkCard, linkCardData } from "./link-card";

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
  p: ({ children, node }) => {
    const href = bareUrlHref(node);
    const card = linkCardData(href);
    if (card) return <LinkCard data={card} />;
    return <p className="my-3 first:mt-0 last:mb-0">{children}</p>;
  },
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
  pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-card bg-active p-4 leading-6">{children}</pre>,
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
// vide rouvrait l'application. On garde donc la cible brute dans `href` UNIQUEMENT pour la lire : le rendu
// ci-dessous ne la réutilise que si c'est http(s)/mailto:, sinon il la remplace par le fichier joint ou du texte.
const keepHref = (url: string, key: string) => (key === "href" ? url : defaultUrlTransform(url));

export type MarkdownFile = { name: string; url: string };

/**
 * `files` : les pièces jointes du message. Un lien qui vise l'un d'eux (par son nom) s'ouvre via `renderFile`
 * (aperçu dans DONNA). Fourni par l'appelant plutôt que importé : le visualiseur de fichiers rend lui-même du
 * Markdown, un import direct ferait un cycle.
 */
export function Markdown({
  children,
  files = [],
  renderFile,
}: {
  children: string;
  files?: readonly MarkdownFile[];
  renderFile?: (file: MarkdownFile, label: ReactNode) => ReactNode;
}) {
  const merged = useMemo<Components>(
    () => ({
      ...components,
      a: ({ href, children: label }) => {
        const target = linkTarget(href, textOf(label), renderFile ? files : []);
        if (target.kind === "file" && renderFile) return <>{renderFile(target.file, label)}</>;
        if (target.kind === "external") {
          return (
            <a href={target.href} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>
              {label}
            </a>
          );
        }
        return <span>{label}</span>;
      },
    }),
    [files, renderFile],
  );
  return (
    <div className="text-message text-ink [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={merged} urlTransform={keepHref}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
