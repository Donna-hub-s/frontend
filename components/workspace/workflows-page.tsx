"use client";

import Link from "next/link";
import { History, Pause, Play, Trash2, Workflow as WorkflowGlyph } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import { briefingRequest, formatToolArguments, isFinished, isValidTime, needsApproval, tally, type BriefingChannel } from "@/lib/workflows";
import { parseBackendDate, type WorkflowOut, type WorkflowRunOut } from "@/lib/workspace-types";
import { Dialog, DialogHeader } from "./dialog";
import { ChevronIcon, PlusIcon } from "./icons";

type Labels = Dictionary["workspace"]["workflows"];

const POLL_MS = 1200;
const POLL_MAX = 75; // ~90 s : au-delà, le run continue côté serveur, on cesse simplement de l'attendre

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null }> {
  try {
    const response = await fetch(`/api/donna/workflows${path}`, { cache: "no-store", ...init });
    const data = response.status === 204 ? null : ((await response.json().catch(() => null)) as T | null);
    return { ok: response.ok, data };
  } catch {
    return { ok: false, data: null };
  }
}

const post = (path: string) => call<WorkflowOut>(path, { method: "POST" });

/** Page Automatisations : liste, approbation, pause, essai, historique et création depuis le modèle « briefing du matin ». */
export function WorkflowsPage({ lang, labels }: { lang: Locale; labels: Labels }) {
  const [items, setItems] = useState<WorkflowOut[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void call<WorkflowOut[]>("/").then(({ ok, data }) => {
      if (cancelled) return;
      if (ok && data) setItems(data);
      else setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const replace = useCallback((workflow: WorkflowOut) => {
    setItems((list) => (list ? list.map((w) => (w.id === workflow.id ? workflow : w)) : list));
  }, []);
  const remove = useCallback((id: string) => setItems((list) => (list ? list.filter((w) => w.id !== id) : list)), []);

  return (
    <div className="scrollbar-none flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[56rem] flex-col gap-6 px-4 py-8 md:px-8">
        <nav className="flex items-center gap-1.5 text-label text-ink-3">
          <Link href={`/${lang}/app`} className="no-underline hover:text-ink">
            {labels.homeLabel}
          </Link>
          <ChevronIcon size={12} className="-rotate-90" />
          <span className="font-medium text-ink-2">{labels.indexTitle}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-[36rem] flex-col gap-1">
            <h1 className="text-hero-sm font-medium text-ink">{labels.indexTitle}</h1>
            <p className="text-secondary text-ink-3 text-pretty">{labels.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-button bg-bordeaux-700 px-4 text-label font-medium text-white hover:bg-bordeaux-900"
          >
            <PlusIcon size={16} />
            {labels.create}
          </button>
        </div>

        {loadFailed ? (
          <p role="alert" className="rounded-panel bg-surface px-5 py-8 text-center text-message text-danger shadow-card">
            {labels.loadError}
          </p>
        ) : !items ? (
          <p className="py-10 text-center text-secondary text-ink-3">…</p>
        ) : !items.length ? (
          <div className="flex flex-col items-center gap-2 rounded-panel border-2 border-dashed border-border bg-fill/40 px-6 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-peche-100 text-bordeaux-700">
              <WorkflowGlyph size={18} />
            </span>
            <p className="text-label font-medium text-ink">{labels.empty}</p>
            <p className="max-w-[30rem] text-secondary text-ink-3 text-pretty">{labels.emptyHint}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((workflow) => (
              <li key={workflow.id}>
                <WorkflowCard lang={lang} labels={labels} workflow={workflow} onChange={replace} onRemove={remove} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} label={labels.createTitle} className="max-w-[30rem]">
        <BriefingDialog
          labels={labels}
          onClose={() => setDialogOpen(false)}
          onCreated={(workflow) => {
            setItems((list) => [workflow, ...(list ?? [])]);
            setDialogOpen(false);
          }}
        />
      </Dialog>
    </div>
  );
}

// ── Une automatisation ────────────────────────────────────────────────────────

const BADGE: Record<string, string> = {
  draft: "bg-peche-100 text-bordeaux-900",
  active: "bg-success/10 text-success-ink",
  paused: "bg-fill text-ink-2",
};

function WorkflowCard({
  lang,
  labels,
  workflow,
  onChange,
  onRemove,
}: {
  lang: Locale;
  labels: Labels;
  workflow: WorkflowOut;
  onChange: (workflow: WorkflowOut) => void;
  onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [runs, setRuns] = useState<WorkflowRunOut[] | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const approval = needsApproval(workflow);
  // Un brouillon (ou une définition modifiée) se relit AVANT d'être approuvé : détail ouvert d'office.
  const detailsOpen = showDetails || approval;
  const when = (value: string | null) => {
    const at = parseBackendDate(value);
    return at === null ? null : new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(at);
  };

  const loadRuns = useCallback(async () => {
    const { ok, data } = await call<WorkflowRunOut[]>(`/${workflow.id}/runs`);
    if (ok && data && alive.current) setRuns(data);
    return ok && data ? data : null;
  }, [workflow.id]);

  const act = async (name: string, request: () => Promise<{ ok: boolean; data: WorkflowOut | null }>) => {
    setBusy(name);
    setFailed(false);
    const { ok, data } = await request();
    if (!alive.current) return;
    setBusy(null);
    if (ok && data) onChange(data);
    else setFailed(true);
  };

  const runNow = async () => {
    setBusy("run");
    setFailed(false);
    const started = await call<{ run_id: string }>(`/${workflow.id}/run`, { method: "POST" });
    if (!started.ok) {
      setBusy(null);
      setFailed(true);
      return;
    }
    setShowHistory(true);
    for (let attempt = 0; attempt < POLL_MAX && alive.current; attempt += 1) {
      const list = await loadRuns();
      if (list && list[0] && isFinished(list[0])) break;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    const fresh = await call<WorkflowOut>(`/${workflow.id}`);
    if (alive.current) {
      if (fresh.ok && fresh.data) onChange(fresh.data);
      setBusy(null);
    }
  };

  const toggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && runs === null) void loadRuns();
  };

  // Brouillon ou définition modifiée : l'état affiché est « à approuver » (sauf en pause, où on réactive).
  const statusKey = approval && workflow.status !== "paused" ? "draft" : workflow.status;
  const nextRun = workflow.status === "active" ? when(workflow.next_run_at) : null;
  const lastRun = when(workflow.last_run_at);
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-button px-3 text-label font-medium disabled:opacity-60";
  const quiet = `${btn} bg-fill text-ink hover:bg-active`;

  return (
    <article className="rounded-panel bg-surface p-5 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-panel-title font-medium text-ink">
            <span className="truncate">{workflow.name}</span>
            <span className={`rounded-badge px-2 py-0.5 text-meta font-medium ${BADGE[statusKey] ?? BADGE.paused}`}>
              {labels.status[statusKey as keyof Labels["status"]] ?? workflow.status}
            </span>
          </h2>
          <p className="mt-1 text-secondary text-ink-2">{workflow.schedule}</p>
          <p className="mt-0.5 text-meta text-ink-3">
            {labels.origin[workflow.origin as keyof Labels["origin"]] ?? workflow.origin}
            {" · "}
            {nextRun ? <time suppressHydrationWarning>{labels.nextRun.replace("{when}", nextRun)}</time> : null}
            {nextRun ? " · " : null}
            {lastRun ? <time suppressHydrationWarning>{labels.lastRun.replace("{when}", lastRun)}</time> : labels.neverRun}
          </p>
        </div>
        {workflow.conversation_id && (
          <Link href={`/${lang}/app/c/${workflow.conversation_id}`} className="text-label text-bordeaux-700 no-underline hover:underline">
            {labels.openConversation}
          </Link>
        )}
      </header>

      {approval && (
        <p className="mt-3 rounded-badge bg-peche-100 px-3 py-2 text-secondary text-bordeaux-900 text-pretty">
          {workflow.status === "draft" ? labels.draftNote : labels.editedNote}
        </p>
      )}

      {detailsOpen && workflow.lines.length > 0 && (
        <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-secondary leading-5 text-ink-2 marker:text-ink-3">
          {workflow.lines.slice(1).map((line, index) => (
            <li key={index} className="text-pretty">
              {line}
            </li>
          ))}
        </ol>
      )}

      {failed && (
        <p role="alert" className="mt-3 text-secondary text-danger">
          {labels.actionError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {approval ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void act("activate", () => post(`/${workflow.id}/activate`))}
            className={`${btn} bg-bordeaux-700 text-white hover:bg-bordeaux-900`}
          >
            {labels.approve}
          </button>
        ) : workflow.status === "active" ? (
          <button type="button" disabled={busy !== null} onClick={() => void act("pause", () => post(`/${workflow.id}/pause`))} className={quiet}>
            <Pause size={15} />
            {labels.pause}
          </button>
        ) : (
          <button type="button" disabled={busy !== null} onClick={() => void act("activate", () => post(`/${workflow.id}/activate`))} className={`${btn} bg-bordeaux-700 text-white hover:bg-bordeaux-900`}>
            {labels.resume}
          </button>
        )}
        <button type="button" disabled={busy !== null} onClick={() => void runNow()} className={quiet}>
          <Play size={15} />
          {busy === "run" ? labels.running : approval ? labels.testRun : labels.runNow}
        </button>
        {!approval && (
          <button type="button" onClick={() => setShowDetails((value) => !value)} aria-expanded={detailsOpen} className={quiet}>
            {detailsOpen ? labels.hideDetails : labels.details}
          </button>
        )}
        <button type="button" onClick={toggleHistory} aria-expanded={showHistory} className={quiet}>
          <History size={15} />
          {showHistory ? labels.hideHistory : labels.history}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (!confirmingDelete) {
              setConfirmingDelete(true);
              return;
            }
            void (async () => {
              setBusy("delete");
              const { ok } = await call(`/${workflow.id}`, { method: "DELETE" });
              if (!alive.current) return;
              setBusy(null);
              if (ok) onRemove(workflow.id);
              else setFailed(true);
            })();
          }}
          onBlur={() => setConfirmingDelete(false)}
          className={`${btn} ml-auto ${confirmingDelete ? "bg-danger/10 text-danger" : "text-ink-3 hover:bg-active hover:text-ink"}`}
        >
          <Trash2 size={15} />
          {confirmingDelete ? labels.confirmDelete : labels.delete}
        </button>
      </div>

      {showHistory && (
        <div className="mt-4 border-t border-border pt-4">
          {runs === null ? (
            <p className="text-secondary text-ink-3">…</p>
          ) : !runs.length ? (
            <p className="text-secondary text-ink-3">{labels.historyEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {runs.map((run, index) => (
                <RunRow key={run.id} lang={lang} labels={labels} run={run} defaultOpen={index === 0 && run.status === "failed"} />
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

// ── Historique ────────────────────────────────────────────────────────────────

const RUN_TONE: Record<string, string> = {
  running: "text-bordeaux-700",
  succeeded: "text-success-ink",
  failed: "text-danger",
  skipped: "text-ink-3",
};

function RunRow({ lang, labels, run, defaultOpen }: { lang: Locale; labels: Labels; run: WorkflowRunOut; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const at = parseBackendDate(run.started_at);
  const count = tally(run);
  return (
    <li className="rounded-badge bg-white px-3 py-2 shadow-card">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 text-left">
        <span className={`text-label font-medium ${RUN_TONE[run.status] ?? "text-ink-2"}`}>
          {labels.runStatus[run.status as keyof Labels["runStatus"]] ?? run.status}
        </span>
        <span className="text-meta text-ink-3">{labels.trigger[run.trigger as keyof Labels["trigger"]] ?? run.trigger}</span>
        {at && (
          <time suppressHydrationWarning className="text-meta text-ink-3">
            {new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(at)}
          </time>
        )}
        {run.steps.length > 0 && (
          <span className="ml-auto text-meta text-ink-3">
            {labels.tally.replace("{ok}", String(count.ok)).replace("{skipped}", String(count.skipped)).replace("{failed}", String(count.failed))}
          </span>
        )}
      </button>
      {open && (
        <div id={id} className="mt-2 flex flex-col gap-1.5">
          {run.error && <p className="text-secondary text-danger text-pretty">{run.error}</p>}
          {run.steps.map((step) => (
            <div key={step.position} className="text-secondary">
              <span className="font-medium text-ink-2">{step.step_id}</span>{" "}
              <span className={RUN_TONE[step.status] ?? "text-ink-3"}>
                {labels.stepStatus[step.status as keyof Labels["stepStatus"]] ?? step.status}
              </span>
              {(step.error || step.output) && (
                <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-meta text-ink-3">{step.error ?? step.output}</p>
              )}
              {step.detail && step.detail.length > 0 && (
                <details className="mt-1 text-meta text-ink-3">
                  <summary className="cursor-pointer select-none">{labels.toolsCalled.replace("{n}", String(step.detail.length))}</summary>
                  <ol className="mt-1 flex flex-col gap-1.5">
                    {step.detail.map((call, index) => (
                      <li key={index} className="rounded-badge bg-active px-2 py-1">
                        <span className="font-mono font-medium text-ink-2">{call.name}</span>
                        <pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.75rem]">
                          {formatToolArguments(call.arguments)}
                        </pre>
                        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-ink-3">{call.result}</p>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

// ── Création depuis le modèle « briefing du matin » ───────────────────────────

const CHANNELS: BriefingChannel[] = ["app", "whatsapp", "email"];

function BriefingDialog({ labels, onClose, onCreated }: { labels: Labels; onClose: () => void; onCreated: (workflow: WorkflowOut) => void }) {
  const [at, setAt] = useState("08:00");
  const [every, setEvery] = useState<"weekdays" | "day" | "week">("weekdays");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [channels, setChannels] = useState<BriefingChannel[]>(["app"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const timeId = useId();
  const zoneId = useId();
  const listId = useId();
  const d = labels.dialog;

  const submit = async () => {
    if (!isValidTime(at)) return setError(d.timeInvalid);
    if (!channels.length) return setError(d.channelsNone);
    setBusy(true);
    setError(null);
    const { ok, data } = await call<WorkflowOut>("/from-template", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(briefingRequest({ at, timezone: timezone.trim(), every, channels })),
    });
    setBusy(false);
    if (ok && data) onCreated(data);
    else setError(d.error);
  };

  const field = "h-10 w-full rounded-button border border-border bg-white px-3 text-message text-ink focus:border-bordeaux-700 focus:shadow-focus focus:outline-none";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <DialogHeader title={labels.createTitle} subtitle={labels.createHint} closeLabel={d.cancel} onClose={onClose} />
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={timeId} className="text-label font-medium text-ink">
              {d.time}
            </label>
            <input id={timeId} type="time" value={at} onChange={(event) => setAt(event.target.value)} className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-label font-medium text-ink">{d.every}</label>
            <select value={every} onChange={(event) => setEvery(event.target.value as typeof every)} className={field}>
              <option value="weekdays">{d.weekdays}</option>
              <option value="day">{d.day}</option>
              <option value="week">{d.week}</option>
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={zoneId} className="text-label font-medium text-ink">
            {d.timezone}
          </label>
          <input id={zoneId} list={listId} value={timezone} onChange={(event) => setTimezone(event.target.value)} className={field} />
          <datalist id={listId}>
            {zones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label font-medium text-ink">{d.channels}</legend>
          {CHANNELS.map((channel) => (
            <label key={channel} className="flex items-center gap-2 text-message text-ink-2">
              <input
                type="checkbox"
                checked={channels.includes(channel)}
                onChange={(event) => setChannels((list) => (event.target.checked ? [...list, channel] : list.filter((c) => c !== channel)))}
                className="size-4 accent-bordeaux-700"
              />
              {d[channel]}
            </label>
          ))}
        </fieldset>
        {error && (
          <p role="alert" className="text-secondary text-danger">
            {error}
          </p>
        )}
      </div>
      <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" onClick={onClose} className="rounded-button px-3.5 py-2 text-label font-medium text-ink hover:bg-active">
          {d.cancel}
        </button>
        <button type="submit" disabled={busy} className="rounded-button bg-bordeaux-700 px-4 py-2 text-label font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60">
          {d.submit}
        </button>
      </footer>
    </form>
  );
}
