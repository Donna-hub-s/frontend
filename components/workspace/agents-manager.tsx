"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import {
  agentsUrl,
  copyName,
  draftFromAgent,
  draftFromTemplate,
  draftFromVersion,
  draftPayload,
  draftProblems,
  emptyDraft,
  groupState,
  isDirty,
  markSeen,
  setGroup,
  toggleTool,
  toolsSummary,
  type AgentCatalog,
  type AgentDraft,
  type AgentOut,
  type AgentToolGroup,
  type AgentVersionOut,
  type DraftProblem,
} from "@/lib/agents";
import { EFFORTS, type Effort } from "@/lib/models";
import { refreshAgents, useAgentCatalog, useProjectAgents } from "@/lib/use-project-agents";
import { useModels } from "@/lib/use-model-choice";
import { parseBackendDate } from "@/lib/workspace-types";
import { agentEditedLine, agentToolsText, type AgentLabels } from "./agent-menu";
import { Dialog, DialogHeader } from "./dialog";
import { ProjectIcon, ProjectIconPicker } from "./project-icon";

type ProjectLabels = Dictionary["workspace"]["projects"];

const fieldClass =
  "w-full rounded-button border border-border bg-surface px-3 text-message text-ink placeholder:text-ink-3 focus:border-bordeaux-700 focus:shadow-focus focus:outline-none disabled:bg-surface disabled:text-ink-2";
const primaryButton = "rounded-button bg-bordeaux-700 px-3.5 py-2 text-label font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60";
const ghostButton = "rounded-button px-3.5 py-2 text-label font-medium text-ink hover:bg-active disabled:opacity-60";
const smallButton = "rounded-button px-2 py-1 text-meta font-medium text-ink-2 hover:bg-active hover:text-ink disabled:opacity-60";

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; detail?: string }> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
    const body = (await response.json().catch(() => null)) as (T & { detail?: unknown }) | null;
    const detail = body && typeof body === "object" && typeof (body as { detail?: unknown }).detail === "string" ? (body as { detail: string }).detail : undefined;
    return { ok: response.ok, status: response.status, data: response.ok ? body : null, detail };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

type View = { kind: "list" } | { kind: "edit"; agent: AgentOut | null; seed: AgentDraft };

/* ── Carte du projet ─────────────────────────────────────────────────────────── */

/** Les agents du projet dans la colonne latérale : lecture pour tous les membres, création pour le propriétaire et les éditeurs. */
export function AgentsCard({ lang, labels, projectLabels, projectId, canEdit }: { lang: Locale; labels: AgentLabels; projectLabels: ProjectLabels; projectId: string; canEdit: boolean }) {
  const { agents } = useProjectAgents(projectId);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const show = (next: View) => {
    setView(next);
    setOpen(true);
  };

  return (
    <section id="agents" aria-labelledby="project-agents" className="scroll-mt-4 rounded-card border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 id="project-agents" className="flex items-baseline gap-2 text-label font-medium text-ink">
          {labels.cardTitle}
          {agents && agents.length > 0 && <span className="font-normal text-ink-3 tabular-nums">{agents.length}</span>}
        </h2>
        <div className="-mt-1 -mr-1 flex gap-1">
          {canEdit && (
            <button type="button" className={smallButton} onClick={() => show({ kind: "edit", agent: null, seed: emptyDraft() })}>
              {labels.create}
            </button>
          )}
          <button type="button" className={smallButton} onClick={() => show({ kind: "list" })}>
            {labels.manage}
          </button>
        </div>
      </div>
      {!agents ? (
        <p className="mt-2 text-secondary text-ink-3">…</p>
      ) : agents.length === 0 ? (
        <p className="mt-2 text-secondary text-ink-3 text-pretty">{canEdit ? labels.cardEmptyEditor : labels.cardEmpty}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {agents.slice(0, 5).map((agent) => (
            <li key={agent.id} className="flex items-center gap-2 py-1.5">
              <ProjectIcon icon={agent.icon} size={15} className="text-ink-3" />
              <span className="min-w-0 flex-1 truncate text-label text-ink" title={agent.description ?? undefined}>
                {agent.name}
              </span>
              <Link href={`/${lang}/app?project=${encodeURIComponent(projectId)}&agent=${encodeURIComponent(agent.id)}`} className="shrink-0 text-meta text-bordeaux-700 no-underline hover:underline">
                {labels.try}
              </Link>
            </li>
          ))}
          {agents.length > 5 && <li className="py-1 text-meta text-ink-3">+{agents.length - 5}</li>}
        </ul>
      )}
      <AgentsDialog lang={lang} labels={labels} projectLabels={projectLabels} projectId={projectId} canEdit={canEdit} open={open} view={view} setView={setView} onClose={() => setOpen(false)} />
    </section>
  );
}

/* ── Fenêtre de gestion ──────────────────────────────────────────────────────── */

function AgentsDialog({
  lang,
  labels,
  projectLabels,
  projectId,
  canEdit,
  open,
  view,
  setView,
  onClose,
}: {
  lang: Locale;
  labels: AgentLabels;
  projectLabels: ProjectLabels;
  projectId: string;
  canEdit: boolean;
  open: boolean;
  view: View;
  setView: (view: View) => void;
  onClose: () => void;
}) {
  const catalog = useAgentCatalog(lang, open);
  const [reload, setReload] = useState(0);
  const [listed, setListed] = useState<{ reload: number; agents: AgentOut[] | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Liste complète (archivés compris pour ceux qui peuvent les rétablir) : relue à l'ouverture et après chaque changement.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void call<AgentOut[]>(agentsUrl(projectId, canEdit ? "?include_archived=true" : "")).then((result) => {
      if (!cancelled) setListed({ reload, agents: result.data });
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, canEdit, reload]);

  const current: View = view.kind === "edit" && !canEdit && view.agent === null ? { kind: "list" } : view;
  const agents = listed?.reload === reload ? listed.agents : null;
  const loading = listed?.reload !== reload;

  const close = () => {
    setActionError(null);
    onClose();
  };
  const changed = async () => {
    await refreshAgents(projectId);
    setReload((n) => n + 1);
  };

  const patch = async (agent: AgentOut, body: object) => {
    setBusyId(agent.id);
    setActionError(null);
    const result = await call<AgentOut>(agentsUrl(projectId, `/${agent.id}`), { method: "PATCH", body: JSON.stringify(body) });
    setBusyId(null);
    if (result.ok) await changed();
    else setActionError(result.detail ?? labels.errorSave);
  };

  const duplicate = async (agent: AgentOut) => {
    setBusyId(agent.id);
    setActionError(null);
    const payload = { ...draftPayload(draftFromAgent(agent)), name: copyName(agent.name, labels.copySuffix, catalog?.limits.name_max ?? 80) };
    const result = await call<AgentOut>(agentsUrl(projectId), { method: "POST", body: JSON.stringify(payload) });
    setBusyId(null);
    if (result.ok && result.data) {
      markSeen(result.data);
      await changed();
    } else setActionError(result.detail ?? labels.errorSave);
  };

  return (
    <Dialog open={open} onClose={close} label={labels.manageTitle} className="flex max-h-[min(48rem,calc(100dvh-2rem))] max-w-[44rem] flex-col">
      {current.kind === "list" ? (
        <>
          <DialogHeader title={labels.manageTitle} subtitle={labels.manageSubtitle} closeLabel={labels.close} onClose={close}>
            {canEdit && (
              <button type="button" className={primaryButton} onClick={() => setView({ kind: "edit", agent: null, seed: emptyDraft() })}>
                {labels.create}
              </button>
            )}
          </DialogHeader>
          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {actionError && (
              <p role="alert" className="mb-3 text-secondary text-danger">
                {actionError}
              </p>
            )}
            {loading ? (
              <p className="text-secondary text-ink-3">{labels.loading}</p>
            ) : !agents ? (
              <p role="alert" className="text-secondary text-danger">
                {labels.loadError}
              </p>
            ) : (
              <>
                {canEdit && agents.some((a) => a.archived) && (
                  <label className="mb-3 flex items-center gap-2 text-secondary text-ink-2">
                    <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                    {labels.showArchived}
                  </label>
                )}
                {agents.filter((a) => showArchived || !a.archived).length === 0 ? (
                  <p className="text-secondary text-ink-3 text-pretty">{canEdit ? labels.cardEmptyEditor : labels.cardEmpty}</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {agents
                      .filter((a) => showArchived || !a.archived)
                      .map((agent) => (
                        <li key={agent.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                          <ProjectIcon icon={agent.icon} size={18} className="text-ink-3" />
                          <div className="min-w-[10rem] flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-label font-medium text-ink">
                              {agent.name}
                              {agent.archived && <span className="rounded-badge bg-fill px-1.5 text-[10px] leading-4 font-normal text-ink-2">{labels.archivedBadge}</span>}
                              <span className="text-meta font-normal text-ink-3 tabular-nums">v{agent.version}</span>
                            </p>
                            {agent.description && <p className="text-secondary text-ink-2 text-pretty">{agent.description}</p>}
                            <p className="text-meta text-ink-3">{agentEditedLine(labels, agent, lang)}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {!agent.archived && (
                              <Link href={`/${lang}/app?project=${encodeURIComponent(projectId)}&agent=${encodeURIComponent(agent.id)}`} onClick={close} className={`${smallButton} text-bordeaux-700 no-underline`}>
                                {labels.try}
                              </Link>
                            )}
                            <button type="button" className={smallButton} onClick={() => setView({ kind: "edit", agent, seed: draftFromAgent(agent) })}>
                              {agent.can_edit ? labels.edit : labels.view}
                            </button>
                            {agent.can_edit && (
                              <>
                                <button type="button" className={smallButton} disabled={busyId === agent.id} onClick={() => void duplicate(agent)}>
                                  {labels.duplicate}
                                </button>
                                <button type="button" className={smallButton} disabled={busyId === agent.id} onClick={() => void patch(agent, { archived: !agent.archived })}>
                                  {agent.archived ? labels.unarchive : labels.archive}
                                </button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <AgentEditor
          key={current.agent?.id ?? "new"}
          lang={lang}
          labels={labels}
          projectLabels={projectLabels}
          projectId={projectId}
          catalog={catalog}
          agent={current.agent}
          seed={current.seed}
          onBack={() => setView({ kind: "list" })}
          onClose={close}
          onSaved={async (saved) => {
            markSeen(saved); // l'auteur connaît ses consignes : pas de relecture à son premier emploi
            await changed();
            setView({ kind: "list" });
          }}
        />
      )}
    </Dialog>
  );
}

/* ── Éditeur ─────────────────────────────────────────────────────────────────── */

function AgentEditor({
  lang,
  labels,
  projectLabels,
  projectId,
  catalog,
  agent,
  seed,
  onBack,
  onClose,
  onSaved,
}: {
  lang: Locale;
  labels: AgentLabels;
  projectLabels: ProjectLabels;
  projectId: string;
  catalog: AgentCatalog | null;
  agent: AgentOut | null;
  seed: AgentDraft;
  onBack: () => void;
  onClose: () => void;
  onSaved: (agent: AgentOut) => Promise<void>;
}) {
  const readOnly = agent !== null && !agent.can_edit;
  const [draft, setDraft] = useState<AgentDraft>(seed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const models = useModels()?.models ?? [];
  const ids = { name: useId(), description: useId(), instructions: useId(), model: useId() };
  const set = (patch: Partial<AgentDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setTouched(true);
  };

  const limits = catalog?.limits;
  const problems: DraftProblem[] = limits ? draftProblems(draft, limits) : [];
  const dirty = agent ? isDirty(draft, agent) : touched;
  const model = models.find((m) => m.id === draft.model);

  const save = async () => {
    if (!limits || problems.length) return;
    setBusy(true);
    setError(null);
    const payload = draftPayload(draft, limits);
    const result = agent
      ? await call<AgentOut>(agentsUrl(projectId, `/${agent.id}`), { method: "PATCH", body: JSON.stringify({ ...payload, expected_version: agent.version }) })
      : await call<AgentOut>(agentsUrl(projectId), { method: "POST", body: JSON.stringify(payload) });
    setBusy(false);
    if (result.ok && result.data) await onSaved(result.data);
    else setError(result.status === 409 || result.status === 403 ? (result.detail ?? labels.errorSave) : labels.errorSave);
  };

  const back = () => {
    if (!readOnly && dirty && !window.confirm(labels.discard)) return;
    onBack();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogHeader
        title={agent ? agent.name : labels.create}
        subtitle={agent ? agentEditedLine(labels, agent, lang) : labels.createSubtitle}
        closeLabel={labels.close}
        onClose={onClose}
      >
        <button type="button" onClick={back} className={smallButton}>
          {labels.backToList}
        </button>
      </DialogHeader>

      <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {readOnly && <p className="rounded-button bg-surface px-3 py-2 text-secondary text-ink-2 text-pretty">{labels.readOnlyNote}</p>}

        {!agent && catalog && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-label font-medium text-ink">{labels.fromTemplate}</legend>
            <div className="flex flex-wrap gap-2">
              {catalog.templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  title={template.description}
                  onClick={() => (setDraft(draftFromTemplate(template)), setTouched(true))}
                  className="inline-flex items-center gap-1.5 rounded-button border border-border bg-surface px-2.5 py-1.5 text-label text-ink hover:border-bordeaux-700/40"
                >
                  <ProjectIcon icon={template.icon} size={15} className="text-ink-3" />
                  {template.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.name} className="text-label font-medium text-ink">
            {labels.nameLabel}
          </label>
          <input id={ids.name} required disabled={readOnly} maxLength={limits?.name_max ?? 80} value={draft.name} onChange={(e) => set({ name: e.target.value })} className={`h-10 ${fieldClass}`} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.description} className="text-label font-medium text-ink">
            {labels.descriptionLabel}
          </label>
          <input id={ids.description} disabled={readOnly} maxLength={limits?.description_max ?? 300} value={draft.description} onChange={(e) => set({ description: e.target.value })} className={`h-10 ${fieldClass}`} />
        </div>

        {!readOnly && <ProjectIconPicker value={draft.icon} onChange={(icon) => set({ icon })} label={projectLabels.iconLabel} names={projectLabels.iconNames} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.instructions} className="text-label font-medium text-ink">
            {labels.instructionsLabel}
          </label>
          <textarea
            id={ids.instructions}
            required
            disabled={readOnly}
            rows={9}
            value={draft.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
            aria-describedby={`${ids.instructions}-hint`}
            className={`resize-y py-2 ${fieldClass}`}
          />
          <p id={`${ids.instructions}-hint`} className="flex justify-between gap-3 text-meta text-ink-3">
            <span className="text-pretty">{labels.instructionsHint}</span>
            <span className={`shrink-0 tabular-nums ${problems.includes("instructionsLength") ? "text-danger" : ""}`}>
              {labels.counter.replace("{n}", String(draft.instructions.trim().length)).replace("{max}", String(limits?.instructions_max ?? 8000))}
            </span>
          </p>
        </div>

        <ToolsField labels={labels} groups={catalog?.tool_groups ?? []} draft={draft} readOnly={readOnly} onChange={set} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.model} className="text-label font-medium text-ink">
              {labels.modelLabel}
            </label>
            <select id={ids.model} disabled={readOnly} value={draft.model ?? ""} onChange={(e) => set({ model: e.target.value || null, effort: null })} className={`h-10 ${fieldClass}`}>
              <option value="">{labels.modelServer}</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              {draft.model && !model && <option value={draft.model}>{draft.model}</option>}
            </select>
            <p className="text-meta text-ink-3 text-pretty">{labels.modelHint}</p>
          </div>
          {model?.reasoning && (
            <div className="flex flex-col gap-1.5">
              <span className="text-label font-medium text-ink">{labels.effortLabel}</span>
              <div role="radiogroup" aria-label={labels.effortLabel} className="flex gap-1 rounded-button bg-active p-0.5">
                {([null, ...EFFORTS] as (Effort | null)[]).map((effort) => (
                  <button
                    key={effort ?? "auto"}
                    type="button"
                    role="radio"
                    disabled={readOnly}
                    aria-checked={draft.effort === effort}
                    onClick={() => set({ effort })}
                    className={`flex-1 rounded-badge px-2 py-1.5 text-meta font-medium transition-colors ${draft.effort === effort ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink-2"}`}
                  >
                    {effort ? labels.efforts[effort] : labels.efforts.auto}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <StartersField labels={labels} draft={draft} readOnly={readOnly} max={limits?.starters_max ?? 4} maxLength={limits?.starter_max ?? 200} onChange={set} />

        {agent && <History lang={lang} labels={labels} projectId={projectId} agent={agent} canRestore={!readOnly} onRestore={(version) => setDraft((d) => draftFromVersion(d, version))} onTouched={() => setTouched(true)} />}
      </div>

      {!readOnly && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          <button type="submit" disabled={busy || !limits || problems.length > 0 || !dirty} className={primaryButton}>
            {busy ? labels.saving : labels.save}
          </button>
          <button type="button" onClick={back} className={ghostButton}>
            {labels.cancel}
          </button>
          {problems.length > 0 && touched && (
            <span role="status" className="text-secondary text-danger">
              {labels.problems[problems[0]].replace("{max}", String(problemMax(problems[0], limits)))}
            </span>
          )}
          {error && (
            <span role="alert" className="text-secondary text-danger">
              {error}
            </span>
          )}
        </footer>
      )}
    </form>
  );
}

function problemMax(problem: DraftProblem, limits: AgentCatalog["limits"] | undefined): number {
  if (!limits) return 0;
  return problem === "nameLength" ? limits.name_max : problem === "instructionsLength" ? limits.instructions_max : problem === "descriptionLength" ? limits.description_max : problem === "starterLength" ? limits.starter_max : 0;
}

/* ── Outils ──────────────────────────────────────────────────────────────────── */

function ToolsField({ labels, groups, draft, readOnly, onChange }: { labels: AgentLabels; groups: AgentToolGroup[]; draft: AgentDraft; readOnly: boolean; onChange: (patch: Partial<AgentDraft>) => void }) {
  const summary = toolsSummary(draft.restrict ? draft.tools : null, groups);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-label font-medium text-ink">{labels.toolsLabel}</legend>
      <div role="radiogroup" aria-label={labels.toolsLabel} className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-secondary text-ink">
          <input type="radio" name="tools-mode" disabled={readOnly} checked={!draft.restrict} onChange={() => onChange({ restrict: false })} />
          {labels.toolsAll}
        </label>
        <label className="flex items-center gap-2 text-secondary text-ink">
          <input type="radio" name="tools-mode" disabled={readOnly} checked={draft.restrict} onChange={() => onChange({ restrict: true })} />
          {labels.toolsOnly}
        </label>
      </div>
      <p className="text-meta text-ink-3 text-pretty">{labels.toolsHint}</p>
      {draft.restrict && (
        <>
          <div className="flex flex-col gap-2 rounded-card border border-border p-3">
            {groups.map((group) => {
              const state = groupState(draft.tools, group);
              return (
                <div key={group.id} className="flex flex-col gap-1">
                  <label className="flex items-start gap-2 text-label font-medium text-ink" title={group.description}>
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={state === "all"}
                      ref={(el) => {
                        if (el) el.indeterminate = state === "some";
                      }}
                      onChange={(e) => onChange({ tools: setGroup(draft.tools, group, e.target.checked) })}
                      className="mt-1"
                    />
                    <span>
                      {group.label}
                      <span className="ml-2 rounded-badge bg-fill px-1.5 text-[10px] leading-4 font-normal text-ink-2">{labels.risk[group.risk]}</span>
                    </span>
                  </label>
                  <div className="ml-6 flex flex-wrap gap-x-4 gap-y-1">
                    {group.tools.map((tool) => (
                      <label key={tool} className="flex items-center gap-1.5 font-mono text-meta text-ink-2">
                        <input type="checkbox" disabled={readOnly} checked={draft.tools.includes(tool)} onChange={() => onChange({ tools: toggleTool(draft.tools, tool) })} />
                        {tool}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-meta text-ink-3">{summary.kind === "none" ? labels.toolsNone : summary.kind === "some" ? labels.toolsCount.replace("{n}", String(summary.count)).replace("{risk}", labels.risk[summary.risk]) : ""}</p>
        </>
      )}
    </fieldset>
  );
}

/* ── Phrases de départ ───────────────────────────────────────────────────────── */

function StartersField({ labels, draft, readOnly, max, maxLength, onChange }: { labels: AgentLabels; draft: AgentDraft; readOnly: boolean; max: number; maxLength: number; onChange: (patch: Partial<AgentDraft>) => void }) {
  if (readOnly && draft.starters.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-label font-medium text-ink">{labels.startersLabel}</legend>
      {draft.starters.map((starter, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            aria-label={`${labels.startersLabel} ${index + 1}`}
            disabled={readOnly}
            maxLength={maxLength}
            value={starter}
            onChange={(e) => onChange({ starters: draft.starters.map((s, i) => (i === index ? e.target.value : s)) })}
            className={`h-9 ${fieldClass}`}
          />
          {!readOnly && (
            <button type="button" className={smallButton} onClick={() => onChange({ starters: draft.starters.filter((_, i) => i !== index) })}>
              {labels.startersRemove}
            </button>
          )}
        </div>
      ))}
      {!readOnly && draft.starters.length < max && (
        <button type="button" className={`${smallButton} self-start`} onClick={() => onChange({ starters: [...draft.starters, ""] })}>
          {labels.startersAdd}
        </button>
      )}
    </fieldset>
  );
}

/* ── Historique ──────────────────────────────────────────────────────────────── */

function History({
  lang,
  labels,
  projectId,
  agent,
  canRestore,
  onRestore,
  onTouched,
}: {
  lang: Locale;
  labels: AgentLabels;
  projectId: string;
  agent: AgentOut;
  canRestore: boolean;
  onRestore: (version: AgentVersionOut) => void;
  onTouched: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<{ agent: string; version: number; rows: AgentVersionOut[] | null } | null>(null);
  const [shown, setShown] = useState<number | null>(null);

  // Lu à la première ouverture, et relu si l'agent a changé de version entre-temps.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void call<AgentVersionOut[]>(agentsUrl(projectId, `/${agent.id}/versions`)).then((result) => {
      if (!cancelled) setVersions({ agent: agent.id, version: agent.version, rows: result.data });
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, agent.id, agent.version]);

  const rows = versions && versions.agent === agent.id && versions.version === agent.version ? versions.rows : null;
  const loading = open && !(versions && versions.agent === agent.id && versions.version === agent.version);

  return (
    <section aria-label={labels.historyTitle} className="flex flex-col gap-2 border-t border-border pt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="self-start text-label font-medium text-ink hover:text-bordeaux-700">
        {labels.historyTitle} {open ? "▾" : "▸"}
      </button>
      {open &&
        (loading ? (
          <p className="text-secondary text-ink-3">{labels.loading}</p>
        ) : !rows ? (
          <p role="alert" className="text-secondary text-danger">
            {labels.loadError}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((version) => {
              const at = parseBackendDate(version.created_at);
              return (
                <li key={version.version} className="flex flex-col gap-1 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-secondary text-ink-2">
                    <span className="tabular-nums">
                      {labels.historyLine
                        .replace("{version}", String(version.version))
                        .replace("{who}", version.created_by_email ?? version.created_by)
                        .replace("{date}", at ? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(at) : "—")}
                    </span>
                    <button type="button" className={smallButton} onClick={() => setShown(shown === version.version ? null : version.version)}>
                      {shown === version.version ? labels.historyHide : labels.historyShow}
                    </button>
                    {canRestore && version.version !== agent.version && (
                      <button
                        type="button"
                        className={smallButton}
                        onClick={() => {
                          onRestore(version);
                          onTouched();
                        }}
                      >
                        {labels.historyRestore}
                      </button>
                    )}
                  </div>
                  {shown === version.version && (
                    <div className="flex flex-col gap-1">
                      <pre className="max-h-48 overflow-y-auto rounded-card border border-border bg-surface px-3 py-2 font-sans text-secondary whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{version.instructions}</pre>
                      <p className="text-meta text-ink-3">
                        {labels.toolsLabel} : <span className={version.tools?.length ? "font-mono" : ""}>{agentToolsText(labels, version.tools)}</span>
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
