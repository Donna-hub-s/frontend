"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Rendu des réponses de DONNA. Pas de HTML brut (react-markdown l'ignore par défaut) :
// le contenu vient d'un modèle et peut refléter des données externes (emails, pages web).
const components: Components = {
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-rose-300 underline-offset-2">
      {children}
    </a>
  ),
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

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-message text-ink [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
