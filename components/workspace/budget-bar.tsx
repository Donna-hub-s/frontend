"use client";

import { budgetBarWidth, budgetPercent, budgetTone, formatTokens, type UsageBudgetState } from "@/lib/usage";

type Money = (usd: number) => string;

const TONE_BAR = { ok: "bg-brand/70", warn: "bg-notification", exceeded: "bg-danger" } as const;
const TONE_TEXT = { ok: "text-ink-2", warn: "text-notification", exceeded: "text-danger" } as const;

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** Où en est un budget : barre colorée (ambre dès 80 %, rouge au plafond), puis « 12 $ sur 20 $ » et/ou « 3 M sur 5 M jetons ». */
export function BudgetBar({
  state,
  money,
  lang,
  labels,
  compact = false,
}: {
  state: UsageBudgetState;
  money: Money;
  lang: string;
  labels: { budgetCost: string; budgetTokens: string };
  compact?: boolean;
}) {
  const tone = budgetTone(state);
  const percent = budgetPercent(state.ratio);
  const parts = [
    state.limit_cost_usd ? fill(labels.budgetCost, { used: money(state.used_cost_usd), limit: money(state.limit_cost_usd) }) : "",
    state.limit_tokens ? fill(labels.budgetTokens, { used: formatTokens(state.used_tokens, lang), limit: formatTokens(state.limit_tokens, lang) }) : "",
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-fill" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)} aria-label={`${percent} %`}>
        <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${budgetBarWidth(state.ratio)}%` }} />
      </div>
      <p className={`${compact ? "text-meta" : "text-secondary"} ${TONE_TEXT[tone]}`}>
        {percent} % · {parts.join(" · ")}
      </p>
    </div>
  );
}
