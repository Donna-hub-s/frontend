"use client";

import { Bot } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import type { AgentOut } from "@/lib/agents";
import { parseBackendDate } from "@/lib/workspace-types";
import { Dialog, DialogHeader } from "./dialog";
import { ProjectIcon } from "./project-icon";

export type AgentLabels = Dictionary["workspace"]["agents"];

/** « Version 3 · modifié par x@y.z le 2 mars » : qui a écrit ce que le modèle lira, et quand. */
export function agentEditedLine(labels: AgentLabels, agent: Pick<AgentOut, "version" | "updated_by" | "updated_by_email" | "updated_at">, lang: Locale): string {
  const at = parseBackendDate(agent.updated_at);
  return labels.editedLine
    .replace("{version}", String(agent.version))
    .replace("{who}", agent.updated_by_email ?? agent.updated_by)
    .replace("{date}", at ? new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }).format(at) : "—");
}

export const agentToolsText = (labels: AgentLabels, tools: string[] | null) =>
  tools === null ? labels.toolsAll : tools.length ? tools.join(", ") : labels.toolsNone;

/**
 * Sélecteur d'agent du composer : un rôle défini par les membres du projet. Il restreint les outils de DONNA, jamais ne
 * les étend. Le choix suit la conversation ; « DONNA seule » le retire.
 */
export function AgentMenu({
  lang,
  labels,
  projectId,
  agents,
  value,
  onPick,
}: {
  lang: Locale;
  labels: AgentLabels;
  projectId: string;
  agents: AgentOut[];
  value: string | null;
  onPick: (agent: AgentOut | null) => void;
}) {
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

  const active = agents.find((a) => a.id === value) ?? null;
  const gone = Boolean(value) && !active; // agent archivé ou retiré : le serveur le refuserait, on invite à le quitter
  const title = active ? labels.menuActive.replace("{name}", active.name) : gone ? labels.menuGone : labels.menuTitle;

  return (
    <div ref={ref} className="sm:relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        aria-label={title}
        title={title}
        className={`inline-flex h-9 max-w-[11rem] items-center gap-1.5 rounded-button px-2 text-meta transition-colors ${
          open ? "bg-active text-ink" : gone ? "bg-danger/10 font-medium text-danger" : active ? "bg-bordeaux-700/10 font-medium text-bordeaux-700" : "text-ink-2 hover:bg-active hover:text-ink"
        }`}
      >
        <Bot size={17} className="shrink-0" />
        {(active || gone) && <span className="truncate">{active ? active.name : labels.menuGone}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label={labels.menuTitle} className="absolute bottom-full inset-x-0 z-30 mb-2 sm:inset-x-auto sm:left-0 flex max-h-[min(30rem,70dvh)] sm:w-[22rem] flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-float">
          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-2">
            <p className="px-2 pt-1 pb-1.5 text-meta text-ink-3 text-pretty">{labels.menuHint}</p>
            <div role="radiogroup" aria-label={labels.menuTitle}>
              <Row
                selected={!value}
                title={labels.menuNone}
                detail={labels.menuNoneHint}
                onSelect={() => {
                  onPick(null);
                  setOpen(false);
                }}
              />
              {agents.map((agent) => (
                <Row
                  key={agent.id}
                  selected={agent.id === value}
                  title={agent.name}
                  detail={agent.description}
                  icon={agent.icon}
                  onSelect={() => {
                    onPick(agent);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          </div>
          <div className="border-t border-border p-1">
            <Link href={`/${lang}/app/projects/${projectId}#agents`} className="block rounded-button px-2 py-1.5 text-label text-ink-2 no-underline hover:bg-active hover:text-ink">
              {labels.menuManage}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ selected, title, detail, icon, onSelect }: { selected: boolean; title: string; detail?: string | null; icon?: string | null; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-start gap-2.5 rounded-button px-2 py-1.5 text-left hover:bg-active ${selected ? "bg-bordeaux-700/10" : ""}`}
    >
      {icon !== undefined && <ProjectIcon icon={icon} size={16} className="mt-0.5 text-ink-3" />}
      <span className="min-w-0">
        <span className={`block truncate text-label ${selected ? "font-medium text-bordeaux-700" : "text-ink"}`}>{title}</span>
        {detail && <span className="block text-meta text-ink-3 text-pretty">{detail}</span>}
      </span>
    </button>
  );
}

/**
 * Relecture avant l'emploi d'un agent : ses consignes ont été écrites par un membre du projet et seront lues par DONNA pour
 * vous. On les montre en entier, avec qui les a écrites et quand, avant la première utilisation (et après chaque changement).
 */
export function AgentReviewDialog({
  lang,
  labels,
  agent,
  changed,
  onConfirm,
  onCancel,
}: {
  lang: Locale;
  labels: AgentLabels;
  agent: AgentOut | null;
  /** Déjà utilisé dans une version précédente : on le dit. */
  changed: boolean;
  onConfirm: (agent: AgentOut) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={agent !== null} onClose={onCancel} label={labels.reviewTitle} className="flex max-h-[min(40rem,calc(100dvh-2rem))] max-w-[34rem] flex-col">
      {agent && (
        <>
          <DialogHeader title={labels.reviewTitle} subtitle={agent.name} closeLabel={labels.close} onClose={onCancel} />
          <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
            <p className="text-secondary text-ink-2 text-pretty">{labels.reviewIntro}</p>
            {changed && <p role="status" className="rounded-button bg-peche-100 px-3 py-2 text-secondary text-bordeaux-900 text-pretty">{labels.reviewChanged}</p>}
            {agent.description && <p className="text-label text-ink">{agent.description}</p>}
            <section aria-label={labels.instructionsLabel}>
              <h3 className="mb-1 text-label font-medium text-ink">{labels.instructionsLabel}</h3>
              <pre className="max-h-64 overflow-y-auto rounded-card border border-border bg-surface px-3 py-2 font-sans text-secondary whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{agent.instructions}</pre>
            </section>
            <p className="text-secondary text-ink-2">
              <span className="font-medium text-ink">{labels.toolsLabel} : </span>
              <span className={agent.tools?.length ? "font-mono text-meta" : ""}>{agentToolsText(labels, agent.tools)}</span>
            </p>
            <p className="text-meta text-ink-3">{agentEditedLine(labels, agent, lang)}</p>
          </div>
          <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button type="button" onClick={onCancel} className="rounded-button px-3.5 py-2 text-label font-medium text-ink hover:bg-active">
              {labels.cancel}
            </button>
            <button type="button" autoFocus onClick={() => onConfirm(agent)} className="rounded-button bg-bordeaux-700 px-3.5 py-2 text-label font-medium text-white hover:bg-bordeaux-900">
              {labels.reviewUse}
            </button>
          </footer>
        </>
      )}
    </Dialog>
  );
}
