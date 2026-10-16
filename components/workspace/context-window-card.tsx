"use client";

import { useEffect, useId, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { contextTone } from "@/lib/context";
import {
  barSegments,
  fetchContextBreakdown,
  formatTokens,
  groupBySubagent,
  shareLabel,
  shownWeight,
  toneOf,
  defaultModelId,
  modelsWithWindow,
  type ContextBreakdown,
  type ContextItem,
  type ContextSection,
} from "@/lib/context-window";
import { useModelChoice, useModels } from "@/lib/use-model-choice";
import { useProjectAgents } from "@/lib/use-project-agents";
import type { ConversationOut } from "@/lib/workspace-types";
import { Dialog, DialogHeader } from "./dialog";

type Labels = Dictionary["workspace"]["projects"];
type CtxLabels = Labels["contextWindow"];

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);

const selectClass = "w-full rounded-button border border-border bg-surface px-2 py-1.5 text-label text-ink";

/** Barre empilée : un segment par rubrique qui pèse dans la fenêtre de DONNA, à l'échelle de la fenêtre quand elle est connue. */
function ContextBar({ data, label }: { data: ContextBreakdown; label: string }) {
  const segments = barSegments(data.sections, data.window);
  const tone = data.percent === null ? "ok" : contextTone(data.percent);
  return (
    <div
      role="img"
      aria-label={label}
      className={`flex h-2.5 w-full overflow-hidden rounded-full bg-pending ${tone === "high" ? "ring-1 ring-danger" : ""}`}
    >
      {segments.map((segment) => (
        <span key={segment.id} data-segment={segment.id} className={`h-full ${toneOf(segment.kind)}`} style={{ width: `${segment.pct}%` }} />
      ))}
    </div>
  );
}

function summaryText(c: CtxLabels, lang: string, data: ContextBreakdown): { used: string; share: string } {
  const used = fill(c.tokens, { n: formatTokens(data.used_tokens, lang) });
  const share =
    data.window && data.model && data.percent !== null
      ? fill(c.ofWindow, { pct: data.percent, model: data.model.label, window: formatTokens(data.window, lang) })
      : c.noWindow;
  return { used, share };
}

function ItemRow({ item, c, lang }: { item: ContextItem; c: CtxLabels; lang: string }) {
  const head = (
    <span className="flex items-baseline justify-between gap-3">
      <span className={`min-w-0 truncate ${item.active ? "text-ink" : "text-ink-3"}`}>{item.label}</span>
      <span className="shrink-0 tabular-nums text-ink-3">{fill(c.itemTokens, { n: formatTokens(item.tokens, lang) })}</span>
    </span>
  );
  const note = item.note ? <span className="block text-meta text-ink-3">{item.note}</span> : null;
  if (!item.text) {
    return (
      <li className="flex flex-col py-1 text-meta">
        {head}
        {note}
      </li>
    );
  }
  return (
    <li className="py-1 text-meta">
      <details>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden" aria-label={`${item.label} — ${c.showText}`}>
          {head}
        </summary>
        {note}
        <pre className="mt-1 max-h-40 overflow-auto rounded-badge bg-active p-2 text-micro whitespace-pre-wrap text-ink-2">{item.text}</pre>
      </details>
    </li>
  );
}

function ItemList({ section, c, lang }: { section: ContextSection; c: CtxLabels; lang: string }) {
  if (!section.items.length) return null;
  const loaded = section.items.filter((i) => i.active);
  const skipped = section.items.filter((i) => !i.active);
  const skippedWeight = skipped.reduce((sum, i) => sum + i.tokens, 0);
  const groups = section.kind === "mcp" ? groupBySubagent(loaded) : [{ agent: "", items: loaded, tokens: 0 }];
  return (
    <div className="mt-2 flex flex-col gap-2">
      {groups.map((group) => (
        <div key={group.agent}>
          {group.agent && <p className="text-meta font-medium text-ink-2">{group.agent}</p>}
          <ul className="max-h-64 divide-y divide-border overflow-y-auto">
            {group.items.map((item) => (
              <ItemRow key={item.id} item={item} c={c} lang={lang} />
            ))}
          </ul>
        </div>
      ))}
      {skipped.length > 0 && (
        <details>
          <summary className="cursor-pointer text-meta text-ink-2">
            {fill(c.notLoaded, { n: skipped.length })}
            {skippedWeight > 0 && <span className="text-ink-3"> — {fill(c.notLoadedWeight, { n: formatTokens(skippedWeight, lang) })}</span>}
          </summary>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto">
            {skipped.map((item) => (
              <ItemRow key={item.id} item={item} c={c} lang={lang} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SectionRow({ section, data, c, lang }: { section: ContextSection; data: ContextBreakdown; c: CtxLabels; lang: string }) {
  const names = c.sections as Record<string, string>;
  const weight = shownWeight(section);
  const base = data.window ?? data.used_tokens;
  const share = section.counted ? shareLabel(section.tokens, base) : null;
  const label = names[section.id] ?? section.label;
  const body = section.text || section.items.length > 0 || section.note;
  const weightText = section.counted
    ? formatTokens(weight, lang)
    : section.variable
      ? fill(c.upTo, { n: formatTokens(weight, lang) })
      : formatTokens(weight, lang);

  const summary = (
    <span className="flex items-center gap-2.5">
      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${toneOf(section.kind)}`} />
      <span className="min-w-0 flex-1 truncate text-label text-ink">{label}</span>
      {section.variable && <span className="shrink-0 rounded-badge bg-active px-1.5 py-0.5 text-micro text-ink-2">{c.variable}</span>}
      {!section.counted && !section.variable && <span className="shrink-0 rounded-badge bg-active px-1.5 py-0.5 text-micro text-ink-2">{c.outside}</span>}
      <span className="shrink-0 text-label tabular-nums text-ink">{weightText}</span>
      <span className="w-12 shrink-0 text-right text-meta tabular-nums text-ink-3">{share ? `${share} %` : ""}</span>
    </span>
  );

  return (
    <li className="border-b border-border last:border-b-0" data-section={section.id}>
      {body ? (
        <details>
          <summary className="cursor-pointer list-none py-2.5 [&::-webkit-details-marker]:hidden">{summary}</summary>
          <div className="pb-3 pl-5">
            {section.note && <p className="text-meta text-ink-2 text-pretty">{section.note}</p>}
            {section.counted && section.potential_tokens > 0 && (
              <p className="text-meta text-ink-3">{fill(c.wouldWeigh, { n: formatTokens(section.potential_tokens, lang) })}</p>
            )}
            {section.text && (
              <pre className="mt-2 max-h-48 overflow-auto rounded-badge bg-active p-2 text-micro whitespace-pre-wrap text-ink-2">{section.text}</pre>
            )}
            {section.truncated && <p className="text-meta text-ink-3">{c.truncated}</p>}
            <ItemList section={section} c={c} lang={lang} />
          </div>
        </details>
      ) : (
        <div className="py-2.5">{summary}</div>
      )}
    </li>
  );
}

/**
 * Fenêtre de contexte du projet : résumé dans la colonne latérale (barre + total) et détail dans une fenêtre — chaque élément qui prend de la
 * place (consigne système, outils, outils MCP des sous-agents, consignes, mémoire, fichiers, historique, extraits RAG), avec sa taille et sa
 * part de la fenêtre du modèle choisi. Tout vient du serveur, qui lit les mêmes données que le vrai message sans appeler de modèle ni lancer de
 * recherche. Le modèle choisi ici n'est qu'une loupe : il ne change pas celui du composeur.
 */
export function ContextWindowCard({
  lang,
  labels,
  projectId,
  conversations,
  refreshKey = 0,
}: {
  lang: string;
  labels: Labels;
  projectId: string;
  conversations: ConversationOut[];
  refreshKey?: string | number;
}) {
  const c = labels.contextWindow;
  const titleId = useId();
  const choice = useModelChoice();
  const models = useModels();
  const { agents } = useProjectAgents(projectId);
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [agentId, setAgentId] = useState("");
  // undefined : l'utilisateur n'a rien choisi ici, on prend le modèle du composeur s'il est utilisable.
  const [modelPick, setModelPick] = useState<string | null | undefined>(undefined);
  const modelId = modelPick === undefined ? defaultModelId(choice, models?.models) : modelPick;
  const key = [projectId, conversationId, agentId, modelId ?? "", refreshKey].join("|");
  const [loaded, setLoaded] = useState<{ key: string; result: Awaited<ReturnType<typeof fetchContextBreakdown>> } | null>(null);

  useEffect(() => {
    let live = true;
    void fetchContextBreakdown(projectId, { conversationId, agentId, model: modelId }).then((result) => {
      if (live) setLoaded({ key, result });
    });
    return () => {
      live = false;
    };
  }, [key, projectId, conversationId, agentId, modelId]);

  const current = loaded?.key === key ? loaded.result : null;
  const data = current?.ok ? current.data : null;
  const text = data ? summaryText(c, lang, data) : null;
  const catalog = modelsWithWindow(models?.models);

  return (
    <section aria-labelledby={titleId} className="rounded-panel bg-surface shadow-card">
      <header className="flex min-h-12 items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h2 id={titleId} className="text-label font-medium text-ink">
          {c.title}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-button px-2.5 py-1 text-label font-medium text-brand hover:bg-active"
        >
          {c.details}
        </button>
      </header>
      <div className="flex flex-col gap-1.5 px-4 pb-4">
        {data && text ? (
          <>
            <ContextBar data={data} label={`${text.used} — ${text.share}`} />
            <p className="text-meta text-ink-2 tabular-nums">
              {text.used} · {text.share}
            </p>
          </>
        ) : (
          <p className="text-meta text-ink-3">{current && !current.ok ? c.error : c.loading}</p>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} label={c.detailsTitle} className="flex max-h-[min(48rem,calc(100dvh-2rem))] max-w-[44rem] flex-col">
        <DialogHeader title={c.detailsTitle} subtitle={c.detailsHint} closeLabel={labels.close} onClose={() => setOpen(false)} />
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-meta text-ink-2">
              {c.model}
              <select value={modelId ?? ""} onChange={(event) => setModelPick(event.target.value || null)} className={selectClass}>
                <option value="">{c.noModel}</option>
                {catalog.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-meta text-ink-2">
              {c.conversation}
              <select value={conversationId} onChange={(event) => setConversationId(event.target.value)} className={selectClass}>
                <option value="">{c.projectOnly}</option>
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-meta text-ink-2">
              {c.agent}
              <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className={selectClass}>
                <option value="">{c.agentDefault}</option>
                {(agents ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!current && <p className="mt-4 text-label text-ink-3">{c.loading}</p>}
          {current && !current.ok && (
            <p role="alert" className="mt-4 text-label text-danger">
              {c.error}
            </p>
          )}
          {data && text && (
            <div className="mt-4 flex flex-col gap-1.5">
              <ContextBar data={data} label={`${text.used} — ${text.share}`} />
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-label text-ink tabular-nums">
                <span className="font-medium">{text.used}</span>
                <span className="text-ink-2">{text.share}</span>
              </p>
              {data.window ? (
                <p className="text-meta text-ink-3 tabular-nums">
                  {c.free} : {formatTokens(Math.max(0, data.window - data.used_tokens), lang)}
                </p>
              ) : null}
              <ul className="mt-2">
                {data.sections.map((section) => (
                  <SectionRow key={section.id} section={section} data={data} c={c} lang={lang} />
                ))}
              </ul>
              <p className="mt-2 text-meta text-ink-3 text-pretty">{c.estimate}</p>
            </div>
          )}
        </div>
      </Dialog>
    </section>
  );
}
