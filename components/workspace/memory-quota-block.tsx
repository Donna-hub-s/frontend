"use client";

import { useEffect, useId, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import {
  QUOTA_KEYS,
  ceiling,
  fetchProjectQuotas,
  fetchWorkspaceQuotas,
  parseInput,
  percent,
  putProjectQuotas,
  putWorkspaceQuotas,
  type ParsedInput,
  type ProjectQuotas,
  type QuotaKey,
  type WorkspaceQuotas,
} from "@/lib/memory-quotas";

type Labels = Dictionary["workspace"]["projects"];

const inputClass = "w-28 rounded-button border border-border bg-surface px-2 py-1 text-label text-ink disabled:opacity-60";
const fmt = (value: number | null, unlimited: string) => (value === null ? unlimited : value.toLocaleString());

/**
 * Jauge de la mémoire d'un projet (faits, part du contexte relue à chaque message, écritures de DONNA aujourd'hui) et, pour qui a le droit,
 * réglage des plafonds : le propriétaire du projet pour le projet, le responsable de l'espace pour tous les projets. Le serveur refuse
 * toute valeur au-dessus de ce que les niveaux supérieurs autorisent ; ici le plafond possible est montré à côté de chaque champ.
 * Baisser un plafond sous l'usage n'efface rien : la jauge passe en alerte et les nouvelles écritures sont bloquées.
 */
export function MemoryQuotaBlock({ labels, projectId, refreshKey = 0 }: { labels: Labels; projectId: string; refreshKey?: number }) {
  const [quotas, setQuotas] = useState<ProjectQuotas | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceQuotas | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [workspaceDraft, setWorkspaceDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<"invalid" | "save" | null>(null);
  const formId = useId();

  useEffect(() => {
    let live = true;
    void Promise.all([fetchProjectQuotas(projectId), fetchWorkspaceQuotas()]).then(([project, space]) => {
      if (!live) return;
      setQuotas(project);
      setWorkspace(space);
    });
    return () => {
      live = false;
    };
  }, [projectId, refreshKey]);

  if (!quotas) return null;
  const q = labels.memoryQuota;
  const names = q.keys as Record<string, string>;
  const { usage, limits } = quotas;
  const unlimited = q.unlimited;

  const factsPct = percent(usage.facts, limits.facts_max.effective);
  const charsPct = percent(usage.chars, limits.memory_prompt_chars_max.effective);
  const overUsage = (limits.facts_max.effective !== null && usage.facts > limits.facts_max.effective) ||
    (limits.memory_prompt_chars_max.effective !== null && usage.chars > limits.memory_prompt_chars_max.effective);
  const tone = (pct: number) => (pct >= 100 ? "bg-danger" : pct > 80 ? "bg-brand-fill" : "bg-rose-300");

  const startEdit = () => {
    setDraft(Object.fromEntries(QUOTA_KEYS.map((key) => [key, limits[key].project === null ? "" : String(limits[key].project)])));
    setWorkspaceDraft(Object.fromEntries(QUOTA_KEYS.map((key) => [key, workspace?.limits[key].tenant == null ? "" : String(workspace.limits[key].tenant)])));
    setFailed(null);
    setEditing(true);
  };

  const collect = (values: Record<string, string>): Partial<Record<QuotaKey, number | null>> | null => {
    const out: Partial<Record<QuotaKey, number | null>> = {};
    for (const key of QUOTA_KEYS) {
      const parsed: ParsedInput = parseInput(values[key] ?? "");
      if (parsed.kind === "invalid") return null;
      out[key] = parsed.kind === "value" ? parsed.value : null;
    }
    return out;
  };

  const save = async () => {
    const projectValues = quotas.can_set ? collect(draft) : {};
    const workspaceValues = workspace?.can_set ? collect(workspaceDraft) : {};
    if (!projectValues || !workspaceValues) {
      setFailed("invalid");
      return;
    }
    setBusy(true);
    setFailed(null);
    // L'espace d'abord : le plafond du projet se juge contre le plafond de l'espace à jour.
    if (workspace?.can_set) {
      const updated = await putWorkspaceQuotas(workspaceValues);
      if (!updated) return fail();
      setWorkspace(updated);
    }
    if (quotas.can_set) {
      const updated = await putProjectQuotas(projectId, projectValues);
      if (!updated) return fail();
      setQuotas(updated);
    } else setQuotas(await fetchProjectQuotas(projectId));
    setBusy(false);
    setEditing(false);

    function fail() {
      setBusy(false);
      setFailed("save");
    }
  };

  const canEdit = quotas.can_set || workspace?.can_set;

  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-meta text-ink-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-ink">{q.title}</span>
        {canEdit && !editing && (
          <button type="button" onClick={startEdit} className="rounded-badge px-2 py-1 text-meta text-brand hover:bg-active">
            {q.edit}
          </button>
        )}
      </div>

      <div>
        <div className="mb-1 flex justify-between gap-2">
          <span>{q.facts}</span>
          <span className="tabular-nums">{usage.facts} / {fmt(limits.facts_max.effective, unlimited)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-active" role="progressbar" aria-valuenow={factsPct} aria-valuemin={0} aria-valuemax={100} aria-label={q.facts}>
          <div className={`h-full rounded-full ${tone(factsPct)}`} style={{ width: `${Math.max(factsPct, usage.facts ? 2 : 0)}%` }} />
        </div>
      </div>
      <div>
        <div className="mb-1 flex justify-between gap-2" title={q.contextHint}>
          <span>{q.context}</span>
          <span className="tabular-nums">{usage.chars.toLocaleString()} / {fmt(limits.memory_prompt_chars_max.effective, unlimited)} · {charsPct} %</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-active" role="progressbar" aria-valuenow={charsPct} aria-valuemin={0} aria-valuemax={100} aria-label={q.context}>
          <div className={`h-full rounded-full ${tone(charsPct)}`} style={{ width: `${Math.max(charsPct, usage.chars ? 2 : 0)}%` }} />
        </div>
      </div>
      <p className="flex justify-between gap-2">
        <span>{q.donnaToday}</span>
        <span className="tabular-nums">{usage.model_writes_today} / {fmt(limits.model_writes_per_day.effective, unlimited)}</span>
      </p>
      {overUsage && <p role="status" className="text-danger text-pretty">{q.overUsage}</p>}

      {editing && (
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="mt-1 flex flex-col gap-3 rounded-card border border-border bg-surface p-3"
        >
          <p className="text-ink-3 text-pretty">{q.editHint}</p>
          {quotas.can_set && (
            <QuotaFields
              title={q.projectLevel}
              keys={names}
              values={draft}
              onChange={setDraft}
              placeholder={(key) => fmt(ceiling({ env: limits[key].env, tenant: limits[key].tenant }), unlimited)}
              max={(key) => ceiling({ env: limits[key].env, tenant: limits[key].tenant })}
              maxLabel={q.max}
              disabled={busy}
            />
          )}
          {workspace?.can_set && (
            <QuotaFields
              title={q.workspaceLevel}
              keys={names}
              values={workspaceDraft}
              onChange={setWorkspaceDraft}
              placeholder={(key) => fmt(workspace.limits[key].env, unlimited)}
              max={(key) => workspace.limits[key].env}
              maxLabel={q.max}
              disabled={busy}
            />
          )}
          {failed && (
            <p role="alert" className="text-danger">
              {failed === "invalid" ? q.invalid : q.saveError}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-button bg-brand-fill px-3 py-1.5 text-meta font-medium text-white hover:bg-brand-fill-strong disabled:opacity-60">
              {q.save}
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className="rounded-button px-3 py-1.5 text-meta font-medium text-ink hover:bg-active">
              {labels.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function QuotaFields({
  title,
  keys,
  values,
  onChange,
  placeholder,
  max,
  maxLabel,
  disabled,
}: {
  title: string;
  keys: Record<string, string>;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  placeholder: (key: QuotaKey) => string;
  max: (key: QuotaKey) => number | null;
  maxLabel: string;
  disabled: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 font-medium text-ink">{title}</legend>
      {QUOTA_KEYS.map((key) => (
        <label key={key} className="flex flex-wrap items-center justify-between gap-2">
          <span>{keys[key]}</span>
          <span className="flex items-center gap-2">
            <input
              inputMode="numeric"
              value={values[key] ?? ""}
              placeholder={placeholder(key)}
              onChange={(event) => onChange({ ...values, [key]: event.target.value })}
              className={inputClass}
              aria-label={`${title} — ${keys[key]}`}
            />
            {max(key) !== null && <span className="text-ink-3">{maxLabel.replace("{n}", String(max(key)))}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
