"use client";

import { Download, Pencil } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import {
  browserTimezone,
  budgetUrl,
  DEFAULT_BUDGET_USER,
  formatTokens,
  limitToInput,
  moneyFormatter,
  parseLimit,
  parseTokens,
  teamExportUrl,
  teamUrl,
  type TeamMember,
  type UsageBudgetRow,
  type UsageTeam,
} from "@/lib/usage";
import { BudgetBar } from "./budget-bar";
import { Dialog, DialogHeader } from "./dialog";

type Labels = Dictionary["workspace"]["usage"];

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

type Editing = { userId: string; who: string; row: UsageBudgetRow | null };

/** Onglet « Équipe » (administrateurs de l'espace) : consommation par membre, budgets mensuels, export CSV. */
export function TeamUsage({ lang, labels, days }: { lang: Locale; labels: Labels; days: number }) {
  const [result, setResult] = useState<{ days: number; version: number; data: UsageTeam | null } | null>(null);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(teamUrl(days, browserTimezone()), { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<UsageTeam>) : null))
      .catch(() => null)
      .then((data) => {
        if (!cancelled) setResult({ days, version, data });
      });
    return () => {
      cancelled = true;
    };
  }, [days, version]);

  const loading = result?.days !== days || result.version !== version;
  const data = loading ? null : result?.data ?? null;
  const money = useMemo(() => moneyFormatter(data?.currency ?? { code: "USD", rate: 1 }, lang), [data?.currency, lang]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  if (!loading && !data) {
    return (
      <p role="alert" className="rounded-panel bg-surface px-5 py-8 text-center text-message text-danger shadow-card">
        {labels.loadError}
      </p>
    );
  }
  if (!data) return <p className="py-10 text-center text-secondary text-ink-3">{labels.loading}</p>;

  const memberName = (m: TeamMember) => m.email ?? m.user_id;
  return (
    <>
      <section className="flex flex-col gap-3 rounded-panel bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex max-w-[34rem] flex-col gap-1">
            <h2 className="text-label font-medium text-ink">{labels.teamTitle}</h2>
            <p className="text-secondary text-ink-3 text-pretty">{labels.teamHint}</p>
          </div>
          <a
            href={teamExportUrl(days, browserTimezone())}
            download
            className="inline-flex items-center gap-2 rounded-button border border-border px-3 py-2 text-label text-ink no-underline hover:bg-active hover:text-ink"
          >
            <Download size={15} />
            {labels.teamExport}
          </a>
        </div>
        {!data.directory_ok && (
          <p role="status" className="rounded-badge bg-peche-100 px-3 py-2 text-secondary text-bordeaux-900">
            {labels.teamDirectoryDown}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-fill/50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-label font-medium text-ink">{labels.teamDefaultTitle}</p>
            <p className="text-meta text-ink-3">{labels.teamDefaultHint}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-secondary text-ink-2">{data.default_budget ? describeLimits(data.default_budget, money, lang, labels) : labels.teamDefaultNone}</span>
            <button
              type="button"
              onClick={() => setEditing({ userId: DEFAULT_BUDGET_USER, who: labels.editDefaultWho, row: data.default_budget })}
              className="inline-flex items-center gap-1.5 rounded-button px-2.5 py-1.5 text-label text-bordeaux-700 hover:bg-active"
            >
              <Pencil size={14} />
              {labels.teamEdit}
            </button>
          </div>
        </div>

        {data.members.length === 0 ? (
          <p className="py-6 text-center text-secondary text-ink-3">{labels.teamNoMembers}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-label">
              <thead>
                <tr className="text-meta text-ink-3">
                  <th className="py-2 pr-3 font-medium">{labels.teamMember}</th>
                  <th className="px-3 py-2 text-right font-medium">{labels.teamRequests}</th>
                  <th className="px-3 py-2 text-right font-medium">{labels.teamTokens}</th>
                  <th className="px-3 py-2 text-right font-medium">{labels.teamCost}</th>
                  <th className="w-56 px-3 py-2 font-medium">{labels.teamBudget}</th>
                  <th className="w-10 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <tr key={member.user_id} className="border-t border-border align-top">
                    <td className="max-w-[16rem] py-2.5 pr-3">
                      <p className="truncate text-ink" title={memberName(member)}>
                        {memberName(member)}
                      </p>
                      <p className="text-meta text-ink-3">{[member.is_owner ? labels.teamOwner : "", member.former ? labels.teamFormer : "", !member.is_active ? labels.teamInactive : ""].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{member.requests}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{formatTokens(member.input_tokens + member.output_tokens, lang)}</td>
                    <td className="px-3 py-2.5 text-right text-ink">
                      {member.estimated ? "≈ " : ""}
                      {member.unpriced ? "≥ " : ""}
                      {money(member.cost_usd)}
                    </td>
                    <td className="px-3 py-2.5">
                      {member.budget ? (
                        <>
                          <BudgetBar state={member.budget} money={money} lang={lang} labels={labels} compact />
                          <p className="mt-0.5 text-meta text-ink-3">{member.budget.source === "default" ? labels.budgetDefault : labels.budgetOwn}</p>
                        </>
                      ) : (
                        <span className="text-secondary text-ink-3">{labels.teamNoBudget}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {!member.former && (
                        <button
                          type="button"
                          aria-label={`${labels.teamEdit} — ${memberName(member)}`}
                          onClick={() =>
                            setEditing({
                              userId: member.user_id,
                              who: memberName(member),
                              row: member.budget?.source === "user" ? { user_id: member.user_id, limit_cost_usd: member.budget.limit_cost_usd, limit_tokens: member.budget.limit_tokens, block_at_limit: member.budget.block_at_limit, updated_by: null, updated_at: null } : null,
                            })
                          }
                          className="rounded-button p-1.5 text-ink-3 hover:bg-active hover:text-ink"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-meta text-ink-3">{labels.budgetMonthNote}</p>
      </section>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} label={editing ? fill(labels.editTitle, { who: editing.who }) : labels.teamEdit} className="max-w-[30rem]">
        {editing && (
          <BudgetDialog
            key={editing.userId}
            labels={labels}
            editing={editing}
            currency={data.currency}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function describeLimits(row: UsageBudgetRow, money: (usd: number) => string, lang: string, labels: Labels): string {
  const parts = [row.limit_cost_usd !== null ? money(row.limit_cost_usd) : "", row.limit_tokens !== null ? `${formatTokens(row.limit_tokens, lang)} tok` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : labels.teamNoBudget;
}

const field = "h-10 w-full rounded-button border border-border bg-white px-3 text-label text-ink outline-none focus:border-bordeaux-700";

function BudgetDialog({
  labels,
  editing,
  currency,
  onClose,
  onSaved,
}: {
  labels: Labels;
  editing: Editing;
  currency: { code: string; rate: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const costId = useId();
  const tokensId = useId();
  const [cost, setCost] = useState(limitToInput(editing.row?.limit_cost_usd ?? null, currency.rate));
  const [tokens, setTokens] = useState(editing.row?.limit_tokens !== null && editing.row?.limit_tokens !== undefined ? String(editing.row.limit_tokens) : "");
  const [block, setBlock] = useState(editing.row?.block_at_limit ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (init: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(budgetUrl(editing.userId), { ...init, cache: "no-store" });
      if (response.ok) onSaved();
      else setError(labels.saveError);
    } catch {
      setError(labels.saveError);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const usd = parseLimit(cost, currency.rate);
    const tok = parseTokens(tokens);
    if (usd === undefined) return setError(labels.invalidAmount);
    if (tok === undefined) return setError(labels.invalidTokens);
    void call({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit_cost_usd: usd, limit_tokens: tok, block_at_limit: block }) });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <DialogHeader title={fill(labels.editTitle, { who: editing.who })} subtitle={labels.editHint} closeLabel={labels.close} onClose={onClose} />
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={costId} className="text-label font-medium text-ink">
            {fill(labels.fieldCost, { currency: currency.code })}
          </label>
          <input id={costId} inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={tokensId} className="text-label font-medium text-ink">
            {labels.fieldTokens}
          </label>
          <input id={tokensId} inputMode="numeric" value={tokens} onChange={(event) => setTokens(event.target.value)} className={field} />
        </div>
        <label className="flex items-start gap-2.5 text-label text-ink">
          <input type="checkbox" checked={block} onChange={(event) => setBlock(event.target.checked)} className="mt-1 size-4 accent-bordeaux-700" />
          <span>
            {labels.fieldBlock}
            <span className="block text-meta text-ink-3">{labels.fieldBlockHint}</span>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-secondary text-danger">
            {error}
          </p>
        )}
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
        <div>
          {editing.row && editing.userId !== DEFAULT_BUDGET_USER && (
            <button type="button" disabled={busy} onClick={() => void call({ method: "DELETE" })} className="rounded-button px-3 py-2 text-label text-danger hover:bg-danger/[0.06] disabled:opacity-60">
              {labels.remove}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-button px-3 py-2 text-label text-ink-2 hover:bg-active">
            {labels.cancel}
          </button>
          <button type="submit" disabled={busy} className="rounded-button bg-bordeaux-700 px-4 py-2 text-label font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60">
            {busy ? labels.saving : labels.save}
          </button>
        </div>
      </footer>
    </form>
  );
}
