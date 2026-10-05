"use client";

import { useEffect, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { AgentVersionOut } from "@/lib/agents";
import { blocksTheStep, pickVersion, refState, resolveUrl, versionsUrl, type AgentRefIn, type ResolvedAgentRef } from "@/lib/workflow-agents";

type Labels = Dictionary["workspace"]["workflowAgents"];

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/**
 * Les agents de projet qu'un workflow FIGE : quel agent, quelle version, ce que contiennent ses consignes (lisibles de tout
 * membre du projet), et si une version plus récente existe — le workflow ne la suit pas tout seul, il faut l'approuver.
 */
export function WorkflowAgents({ refs, labels }: { refs: AgentRefIn[]; labels: Labels }) {
  const key = refs.map((ref) => `${ref.id}:${ref.version}`).join(",");
  const [loaded, setLoaded] = useState<{ key: string; items: ResolvedAgentRef[] | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void fetch(resolveUrl(refs), { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<ResolvedAgentRef[]>) : null))
      .catch(() => null)
      .then((items) => !cancelled && setLoaded({ key, items }));
    return () => {
      cancelled = true;
    };
    // `refs` change d'identité à chaque rendu du parent : la clé texte dit s'il a VRAIMENT changé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return null;
  const items = loaded?.key === key ? loaded.items : undefined;
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="workflow-agents">
      {items === undefined && <p className="text-meta text-ink-3">{labels.loading}</p>}
      {items === null && <p className="text-meta text-danger">{labels.loadFailed}</p>}
      {items?.map((item) => <AgentRefRow key={`${item.id}:${item.version}`} item={item} labels={labels} />)}
    </div>
  );
}

function AgentRefRow({ item, labels }: { item: ResolvedAgentRef; labels: Labels }) {
  const state = refState(item);
  const [detail, setDetail] = useState<AgentVersionOut | "failed" | null>(null);
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || detail || !item.project_id) return;
    void fetch(versionsUrl(item.project_id, item.id), { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<AgentVersionOut[]>) : Promise.reject(new Error("http"))))
      .then((versions) => setDetail(pickVersion(versions, item.version) ?? "failed"))
      .catch(() => setDetail("failed"));
  };

  const note = {
    ok: labels.pinned,
    newer: fill(labels.newer, { current: item.current_version ?? "", version: item.version }),
    archived: labels.archived,
    missing: labels.missing,
    hidden: labels.hidden,
  }[state];
  const blocking = blocksTheStep(state);

  return (
    <div className="rounded-card border border-border bg-fill/50 px-3 py-2.5">
      <p className="text-label font-medium text-ink text-pretty">
        {item.accessible
          ? fill(labels.row, { name: item.name ?? "", version: item.version, project: item.project_name ?? "" })
          : fill(labels.rowHidden, { version: item.version })}
      </p>
      <p className={`mt-1 text-meta text-pretty ${blocking ? "text-danger" : "text-ink-3"}`} role={blocking ? "alert" : undefined}>
        {note}
      </p>
      {item.accessible && item.project_id && item.version_exists && (
        <>
          <button type="button" onClick={toggle} aria-expanded={open} className="mt-1.5 text-label font-medium text-bordeaux-700 hover:underline">
            {open ? labels.hide : fill(labels.show, { version: item.version })}
          </button>
          {open && (
            <div className="mt-2 text-secondary text-ink-2">
              {detail === null && <p className="text-ink-3">{labels.loading}</p>}
              {detail === "failed" && <p className="text-danger">{labels.instructionsFailed}</p>}
              {detail && detail !== "failed" && (
                <>
                  <p className="text-meta text-ink-3">
                    {fill(labels.tools, { tools: detail.tools === null ? labels.toolsAll : detail.tools.length ? detail.tools.join(", ") : labels.toolsNone })}
                  </p>
                  <pre className="scrollbar-none mt-1.5 max-h-56 overflow-y-auto rounded-button bg-white px-3 py-2 font-sans text-secondary leading-5 whitespace-pre-wrap break-words">
                    {detail.instructions}
                  </pre>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
