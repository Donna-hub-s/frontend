"use client";

import { useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { GmailIcon, GoogleCalendarIcon, GoogleDriveIcon, WhatsAppIcon } from "./brand-icons";
import { visibleSteps } from "@/lib/chat-run";
import { parseBackendDate, type ConnectorsOut, type PendingActionOut, type Step } from "@/lib/workspace-types";
import { useWorkspace } from "./workspace-provider";

type WorkspaceDict = Dictionary["workspace"];

// Défini avec l'orchestration du flux (lib/chat-run) : le provider en a besoin
// pour alimenter le panneau sans créer de cycle d'import.
export { visibleSteps };

export const stepLabel = (dict: WorkspaceDict, key: string) => {
  if (key === "rag") return dict.chat.stepRag;
  if (key === "read") return dict.chat.stepRead;
  if (key === "answer") return dict.chat.stepAnswer;
  if (key === "files") return dict.chat.stepFiles;
  return (dict.tools as Record<string, string>)[key] ?? dict.tools.fallback;
};

const timeFormat = (lang: Locale) => new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Pastille d'étape : cercle en cours (anneau animé) ou coche. */
export function StepDot({ status }: { status: Step["status"] }) {
  return status === "done" ? (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-success">
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
        <path d="M3 6.2l1.9 1.9L9 4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ) : (
    <span className="demo-spin size-4 shrink-0 rounded-full border-2 border-pending border-t-bordeaux-700" />
  );
}

export function SidePanel({ lang, dict, connectors }: { lang: Locale; dict: WorkspaceDict; connectors: ConnectorsOut | null }) {
  const { activity, pending } = useWorkspace();
  const { panel } = dict;

  return (
    <aside aria-label={panel.label} className="scrollbar-none hidden w-[20rem] shrink-0 flex-col gap-4 overflow-y-auto bg-page p-4 xl:flex">
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
                  <StepDot status={step.status} />
                </span>
                <span className={`min-w-0 flex-1 text-label ${step.status === "done" ? "text-ink" : "font-medium text-ink"}`}>
                  {stepLabel(dict, step.key)}
                </span>
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
            <span className="rounded-full bg-bordeaux-700 px-2 text-meta font-medium text-white tabular-nums">{pending.length}</span>
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

function PendingItem({ lang, dict, action }: { lang: Locale; dict: WorkspaceDict; action: PendingActionOut }) {
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
        <span className="rounded-badge bg-peche-100 px-1.5 py-0.5 font-medium text-bordeaux-900">
          {(panel.kinds as Record<string, string>)[action.kind] ?? action.kind}
        </span>
        {at && (
          <time className="text-ink-3" suppressHydrationWarning>
            {new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(at)}
          </time>
        )}
      </div>
      <p className="mt-2 text-label text-ink text-pretty">{action.summary}</p>
      {failed && <p className="mt-2 text-secondary text-danger">{panel.actionError}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("confirm")}
          className="rounded-button bg-bordeaux-700 px-3 py-1.5 text-secondary font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60"
        >
          {panel.approve}
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
  const link = `/oauth/google?lang=${lang}&link=1`;
  const googleAction = google?.connected ? { href: link, label: panel.authorize } : { href: link, label: panel.connect };
  const rows: Row[] = [
    { key: "gmail", icon: <GmailIcon />, name: panel.gmail, detail: panel.gmailDetail, connected: Boolean(google?.gmail), offLabel: panel.notConnected, action: googleAction },
    { key: "calendar", icon: <GoogleCalendarIcon />, name: panel.googleCalendar, detail: panel.calendarDetail, connected: Boolean(google?.calendar), offLabel: panel.notConnected, action: googleAction },
    { key: "drive", icon: <GoogleDriveIcon />, name: panel.googleDrive, detail: panel.driveDetail, connected: Boolean(google?.drive), offLabel: panel.notConnected, action: googleAction },
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
          <span className="flex size-9 shrink-0 items-center justify-center rounded-nav border border-border bg-white">{row.icon}</span>
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
              className="shrink-0 rounded-button border border-border bg-white px-2.5 py-1 text-meta font-medium text-bordeaux-700 no-underline hover:border-bordeaux-700/40 hover:text-bordeaux-900"
            >
              {row.action.label}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
