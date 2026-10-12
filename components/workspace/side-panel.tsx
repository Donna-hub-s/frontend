"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { GmailIcon, GoogleCalendarIcon, GoogleDriveIcon, WhatsAppIcon } from "./brand-icons";
import { visibleSteps } from "@/lib/chat-run";
import { linkHref, type GoogleService } from "@/lib/oauth-link";
import { useNow } from "@/lib/use-now";
import { parseBackendDate, type ConnectorsOut, type PendingActionOut, type Step } from "@/lib/workspace-types";
import { ElapsedBadge } from "./elapsed-badge";
import { EmailAttachmentList } from "./email-attachments";
import { estimateText, formatUsd } from "@/lib/research";
import { WorkflowDraft } from "./workflow-draft";
import { useThreadsState, useWorkspace } from "./workspace-provider";

type WorkspaceDict = Dictionary["workspace"];

// Défini avec l'orchestration du flux (lib/chat-run) : le provider en a besoin
// pour alimenter le panneau sans créer de cycle d'import.
export { visibleSteps };

export const stepLabel = (dict: WorkspaceDict, key: string) => {
  if (key === "rag") return dict.chat.stepRag;
  if (key === "rerank") return dict.chat.stepRerank;
  if (key === "documents") return dict.chat.stepDocuments;
  if (key === "project") return dict.chat.stepProject;
  if (key === "memory") return dict.chat.stepMemory;
  if (key === "conversation_files") return dict.chat.stepConversationFiles;
  if (key === "read") return dict.chat.stepRead;
  if (key === "answer") return dict.chat.stepAnswer;
  if (key === "files") return dict.chat.stepFiles;
  return (dict.tools as Record<string, string>)[key] ?? dict.tools.fallback;
};

/** Ligne secondaire d'une étape : ce que la tâche a donné (extraits injectés, documents lus, mémoire…)
 * ou, tant qu'elle tourne, ce qu'elle fait. `warn` : panne ou résultat dégradé, à montrer comme tel. */
export const stepDetail = (dict: WorkspaceDict, step: Step): { text: string; warn: boolean } | null => {
  const t = dict.chat;
  const fill = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
  const data = step.data;

  if (step.key === "rag" && step.status === "running") return { text: t.ragRunning, warn: false };
  if (step.key === "rerank" && step.status === "running") return { text: t.rerankRunning, warn: false };
  if (!data) return null;

  switch (data.kind) {
    case "rag": {
      const info = data.info;
      const project = info.scope === "project";
      if (info.status === "failed") {
        const text = info.error === "index_mismatch" ? t.ragErrorIndexMismatch : info.error === "embeddings_auth" ? t.ragErrorAuth : t.ragErrorUnavailable;
        return { text, warn: true };
      }
      if (info.status === "completed") {
        return { text: fill(project ? t.ragFoundProject : t.ragFound, { n: info.sources_count, m: info.documents_count }), warn: false };
      }
      if (info.status === "empty") {
        if (info.indexed_documents === 0) return { text: project ? t.ragNoDocumentsProject : t.ragNoDocuments, warn: false };
        return { text: fill(project ? t.ragEmptyProject : t.ragEmpty, { n: info.indexed_documents }), warn: false };
      }
      return null;
    }
    case "rerank":
      return data.failed ? { text: t.rerankFailed, warn: true } : data.count != null ? { text: fill(t.rerankDone, { n: data.count }), warn: false } : null;
    case "documents":
      return { text: data.names.length ? data.names.join(", ") : t.documentsNone, warn: !data.names.length };
    case "project": {
      const parts = [data.instructions ? t.projectInstructions : null, data.facts ? fill(t.projectFacts, { n: data.facts }) : null].filter(Boolean);
      return { text: [data.name, parts.join(" · ")].filter(Boolean).join(" — "), warn: false };
    }
    case "memory":
      return { text: fill(t.memoryFacts, { n: data.facts }), warn: false };
    case "convfiles": {
      const shown = data.names.slice(0, 3).join(", ");
      const more = data.names.length > 3 ? ` +${data.names.length - 3}` : "";
      const waiting = data.pending ? ` · ${fill(t.conversationFilesPending, { n: data.pending })}` : "";
      return { text: shown + more + waiting, warn: false };
    }
    case "files": {
      const truncated = data.files.filter((f) => f.truncated);
      const read = fill(t.filesRead, { n: data.files.length });
      const cut = truncated.length ? ` · ${fill(t.filesTruncated, { n: truncated.length }).replace("{names}", truncated.map((f) => f.filename).join(", "))}` : "";
      return { text: read + cut, warn: false };
    }
  }
};

const timeFormat = (lang: Locale) => new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Pastille d'étape : cercle en cours (anneau animé) ou coche. */
export function StepDot({ status, warn = false }: { status: Step["status"]; warn?: boolean }) {
  if (warn) {
    return (
      <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded-full bg-danger-fill text-micro leading-none font-bold text-white">
        !
      </span>
    );
  }
  return status === "done" ? (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-success-fill">
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
        <path d="M3 6.2l1.9 1.9L9 4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ) : (
    <span className="demo-spin size-4 shrink-0 rounded-full border-2 border-pending border-t-brand" />
  );
}

export function SidePanel({ lang, dict, connectors }: { lang: Locale; dict: WorkspaceDict; connectors: ConnectorsOut | null }) {
  const { pending } = useWorkspace();
  const { activity } = useThreadsState();
  const { panel } = dict;
  // Une seule horloge pour la liste, arrêtée dès que plus rien ne tourne (voir lib/use-now.ts).
  const now = useNow(activity.steps.some((step) => step.status === "running"));

  return (
    <aside aria-label={panel.label} className="scrollbar-none hidden w-[20rem] shrink-0 flex-col gap-4 overflow-y-auto bg-page p-4 xl:flex [body[data-canvas-open]_&]:hidden">
      <section className="rounded-panel bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <h2 className="text-panel-title font-medium text-ink">{panel.activity}</h2>
          {activity.status === "running" && (
            <span className="inline-flex items-center gap-1.5 text-meta text-ink-2">
              {panel.live}
              <span className="pending-dot size-1.5 rounded-full bg-success" />
            </span>
          )}
          {activity.status === "done" && <span className="text-meta text-success-ink">{panel.finished}</span>}
        </header>
        {activity.steps.length ? (
          <ol aria-live="polite" className="relative flex flex-col gap-4 px-4 py-4">
            <span aria-hidden className="absolute top-6 bottom-6 left-[1.5625rem] w-px bg-border" />
            {activity.steps.map((step) => (
              <li key={step.id} className="relative flex items-start gap-3">
                <span className="mt-0.5 flex rounded-full bg-surface">
                  <StepDot status={step.status} warn={stepDetail(dict, step)?.warn} />
                </span>
                <span className={`min-w-0 flex-1 text-label ${step.status === "done" ? "text-ink" : "font-medium text-ink"}`}>
                  {stepLabel(dict, step.key)}
                  {stepDetail(dict, step) && (
                    <span className={`mt-0.5 block text-meta font-normal text-pretty ${stepDetail(dict, step)?.warn ? "text-danger" : "text-ink-3"}`}>
                      {stepDetail(dict, step)?.text}
                    </span>
                  )}
                </span>
                {step.status === "running" && <ElapsedBadge startedAt={step.at} now={now} units={dict.chat.elapsed} />}
                <time className="text-meta text-ink-3 tabular-nums" suppressHydrationWarning>
                  {timeFormat(lang).format(step.at)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-4 py-4 text-secondary text-ink-3 text-pretty">{panel.idle}</p>
        )}
      </section>

      <section className="rounded-panel bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <h2 className="text-panel-title font-medium text-ink">{panel.pending}</h2>
          {pending.length > 0 && (
            <span className="rounded-full bg-attention-fill px-2 text-meta font-medium text-white tabular-nums">{pending.length}</span>
          )}
        </header>
        {pending.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {pending.map((action) => (
              <PendingItem key={action.id} lang={lang} dict={dict} action={action} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-secondary text-ink-3">{panel.pendingEmpty}</p>
        )}
      </section>

      <section className="rounded-panel bg-surface">
        <header className="border-b border-border px-4 py-3.5">
          <h2 className="text-panel-title font-medium text-ink">{panel.connectors}</h2>
        </header>
        <ConnectorRows lang={lang} dict={dict} connectors={connectors} />
      </section>
    </aside>
  );
}

/** Une action qui attend une décision. Rendu en <li> : l'accueil la réutilise telle
 * quelle (même rendu, mêmes garde-fous), au lieu d'une seconde carte à maintenir. */
export function PendingItem({ lang, dict, action }: { lang: Locale; dict: WorkspaceDict; action: PendingActionOut }) {
  const { decideAction } = useWorkspace();
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [failed, setFailed] = useState(false);
  const { panel } = dict;
  const at = parseBackendDate(action.created_at);

  const decide = async (decision: "confirm" | "cancel") => {
    setBusy(decision);
    setFailed(false);
    const ok = await decideAction(action.id, decision);
    setBusy(null);
    setFailed(!ok);
  };

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-center justify-between gap-2 text-meta">
        <span className="rounded-badge bg-peche-100 px-1.5 py-0.5 font-medium text-brand-strong">
          {(panel.kinds as Record<string, string>)[action.kind] ?? action.kind}
        </span>
        {at && (
          <time className="text-ink-3" suppressHydrationWarning>
            {new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(at)}
          </time>
        )}
      </div>
      <p className="mt-2 text-label text-ink text-pretty">{action.summary}</p>
      {action.email && <EmailAttachmentList actionId={action.id} attachments={action.email.attachments} openable labels={dict.chat} />}
      {action.workflow && <WorkflowDraft draft={action.workflow} labels={dict.chat} agentLabels={dict.workflowAgents} />}
      {action.research && (
        // Même détail que ActionCard (fil de discussion) avant approbation — une fois confirmée, l'action
        // quitte cette liste (voir decideAction) : pas besoin d'y suivre la progression, seulement l'estimation.
        <>
          <p className="mt-1 text-meta text-ink-3">
            {dict.chat.researchDepth[action.research.depth as keyof typeof dict.chat.researchDepth] ?? action.research.depth}
          </p>
          <p className="mt-1 text-secondary text-ink-2 text-pretty">
            {dict.chat.researchEstimateLine
              .replace("{estimate}", estimateText(action.research.cost_usd, { unknown: dict.chat.researchUnknown, free: dict.chat.researchFree }, lang))
              .replace("{cap}", formatUsd(action.research.cap_usd, lang))}
          </p>
        </>
      )}
      {failed && <p className="mt-2 text-secondary text-danger">{panel.actionError}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("confirm")}
          className="rounded-button bg-brand-fill px-3 py-1.5 text-secondary font-medium text-white hover:bg-brand-fill-strong disabled:opacity-60"
        >
          {action.research ? dict.chat.researchStart : panel.approve}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("cancel")}
          className="rounded-button bg-fill px-3 py-1.5 text-secondary font-medium text-ink hover:bg-active disabled:opacity-60"
        >
          {panel.decline}
        </button>
      </div>
    </li>
  );
}

function StatusDot({ tone, label }: { tone: "ok" | "off"; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-meta ${tone === "ok" ? "text-success-ink" : "text-danger"}`}>
      {label}
      <span className={`size-1.5 rounded-full ${tone === "ok" ? "bg-success" : "bg-danger"}`} />
    </span>
  );
}

type Row = {
  key: string;
  icon: ReactNode;
  name: string;
  detail: string;
  connected: boolean;
  offLabel: string;
  action?: { href: string; label: string };
};

/** Un outil par ligne (Gmail, Agenda, Drive, WhatsApp), chacun avec son état réel. */
export function ConnectorRows({ lang, dict, connectors }: { lang: Locale; dict: WorkspaceDict; connectors: ConnectorsOut | null }) {
  const { panel } = dict;
  const google = connectors?.google;
  const pathname = usePathname();
  // Un lien PAR service : relier l'agenda ne réclame plus la boîte mail, et l'on revient sur la page d'où l'on est parti
  // (la conversation, le projet…) au lieu d'une nouvelle conversation vide.
  const googleAction = (service: GoogleService) => ({
    href: linkHref(lang, { services: [service], next: pathname }),
    label: google?.connected ? panel.authorize : panel.connect,
  });
  const rows: Row[] = [
    { key: "gmail", icon: <GmailIcon />, name: panel.gmail, detail: panel.gmailDetail, connected: Boolean(google?.gmail), offLabel: panel.notConnected, action: googleAction("gmail") },
    { key: "calendar", icon: <GoogleCalendarIcon />, name: panel.googleCalendar, detail: panel.calendarDetail, connected: Boolean(google?.calendar), offLabel: panel.notConnected, action: googleAction("calendar") },
    { key: "drive", icon: <GoogleDriveIcon />, name: panel.googleDrive, detail: panel.driveDetail, connected: Boolean(google?.drive), offLabel: panel.notConnected, action: googleAction("drive") },
  ];
  if (connectors?.whatsapp.enabled) {
    const wa = connectors.whatsapp;
    rows.push({
      key: "whatsapp",
      icon: <WhatsAppIcon />,
      name: panel.whatsappRow,
      detail: panel.whatsappDetail,
      connected: wa.available && wa.paired && wa.online,
      offLabel: wa.available ? panel.notPaired : panel.unavailable,
    });
  }

  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-nav border border-border bg-surface">{row.icon}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-label font-medium text-ink">{row.name}</span>
            <span className="truncate text-meta text-ink-3" title={row.detail}>
              {row.detail}
            </span>
          </span>
          {row.connected || !row.action ? (
            <StatusDot tone={row.connected ? "ok" : "off"} label={row.connected ? panel.connected : row.offLabel} />
          ) : (
            <a
              href={row.action.href}
              aria-label={`${row.action.label} — ${row.name}`}
              className="shrink-0 rounded-button border border-border bg-surface px-2.5 py-1 text-meta font-medium text-brand no-underline hover:border-brand/40 hover:text-brand-strong"
            >
              {row.action.label}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
