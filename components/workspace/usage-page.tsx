"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import {
  barHeights,
  browserTimezone,
  DEFAULT_PERIOD,
  dayLabel,
  formatTokens,
  isEmptyUsage,
  moneyFormatter,
  PERIOD_OPTIONS,
  sharePercent,
  splitModelKey,
  usageUrl,
  type UsageBucket,
  type UsageSummary,
} from "@/lib/usage";
import { BudgetBar } from "./budget-bar";
import { ChevronIcon } from "./icons";
import { TeamUsage } from "./team-usage";

type Labels = Dictionary["workspace"]["usage"];
type Money = (usd: number) => string;

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** Page « Consommation » : ce que l'utilisateur consomme du modèle (jetons, coût estimé), par jour, modèle, usage et projet. */
export function UsagePage({ lang, labels }: { lang: Locale; labels: Labels }) {
  const [days, setDays] = useState<number>(DEFAULT_PERIOD);
  // Résultat tagué par la période demandée : « en cours » se déduit (result.days !== days), sans setState dans l'effet.
  const [result, setResult] = useState<{ days: number; data: UsageSummary | null } | null>(null);
  const [metric, setMetric] = useState<"cost" | "tokens" | null>(null);
  const [tab, setTab] = useState<"mine" | "team">("mine");

  useEffect(() => {
    let cancelled = false;
    void fetch(usageUrl(days, browserTimezone()), { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<UsageSummary>) : null))
      .catch(() => null)
      .then((data) => {
        if (!cancelled) setResult({ days, data });
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const loading = result?.days !== days;
  const data = loading ? null : result?.data ?? null;
  const failed = !loading && data === null;
  // L'onglet « Équipe » n'existe que pour un administrateur de l'espace (le serveur le dit : is_admin).
  const showTeam = tab === "team" && data?.is_admin === true;

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
          <div role="group" aria-label={labels.periodLabel} className="inline-flex rounded-button bg-fill p-0.5">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={days === option}
                onClick={() => setDays(option)}
                className={`rounded-badge px-3 py-1.5 text-label ${days === option ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}
              >
                {fill(labels.periodDays, { n: option })}
              </button>
            ))}
          </div>
        </div>

        {data?.is_admin && (
          <div role="tablist" aria-label={labels.indexTitle} className="inline-flex w-fit rounded-button bg-fill p-0.5">
            {(["mine", "team"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={tab === option}
                onClick={() => setTab(option)}
                className={`rounded-badge px-3 py-1.5 text-label ${tab === option ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}
              >
                {option === "mine" ? labels.tabMine : labels.tabTeam}
              </button>
            ))}
          </div>
        )}

        {showTeam ? (
          <TeamUsage lang={lang} labels={labels} days={days} />
        ) : failed ? (
          <p role="alert" className="rounded-panel bg-surface px-5 py-8 text-center text-message text-danger shadow-card">
            {labels.loadError}
          </p>
        ) : !data ? (
          <p className="py-10 text-center text-secondary text-ink-3">{labels.loading}</p>
        ) : isEmptyUsage(data) && !data.budget ? (
          <div className="flex flex-col items-center gap-2 rounded-panel border-2 border-dashed border-border bg-fill/40 px-6 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-peche-100 text-bordeaux-700">
              <BarChart3 size={18} />
            </span>
            <p className="text-label font-medium text-ink">{labels.empty}</p>
            <p className="max-w-[30rem] text-secondary text-ink-3 text-pretty">{labels.emptyHint}</p>
          </div>
        ) : (
          <Dashboard lang={lang} labels={labels} data={data} metric={metric} onMetric={setMetric} />
        )}
      </div>
    </div>
  );
}

function Dashboard({ lang, labels, data, metric, onMetric }: { lang: Locale; labels: Labels; data: UsageSummary; metric: "cost" | "tokens" | null; onMetric: (m: "cost" | "tokens") => void }) {
  const money = useMemo(() => moneyFormatter(data.currency, lang), [data.currency, lang]);
  const { totals } = data;
  const approx = totals.estimated ? "≈ " : "";
  const hasCost = totals.cost_usd > 0;
  const shown = metric ?? (hasCost ? "cost" : "tokens"); // sans coût (modèles locaux), le graphique montre les jetons

  return (
    <>
      {data.budget && <BudgetCard labels={labels} lang={lang} budget={data.budget} money={money} />}
      <section aria-label={labels.indexTitle} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card title={labels.cost} value={`${approx}${totals.unpriced ? "≥ " : ""}${money(totals.cost_usd)}`} hint={totals.unpriced ? labels.unpricedHint : totals.estimated ? labels.estimatedHint : undefined} />
        <Card
          title={labels.requests}
          value={new Intl.NumberFormat(lang).format(totals.requests)}
          hint={[fill(labels.requestsHint, { calls: totals.calls, rounds: totals.tool_rounds }), totals.sandbox_seconds > 0 ? fill(labels.sandboxHint, { seconds: Math.round(totals.sandbox_seconds) }) : ""].filter(Boolean).join(" · ")}
        />
        <Card title={labels.tokensIn} value={`${totals.estimated ? "≈ " : ""}${formatTokens(totals.input_tokens, lang)}`} />
        <Card title={labels.tokensOut} value={`${totals.estimated ? "≈ " : ""}${formatTokens(totals.output_tokens, lang)}`} />
      </section>

      {data.images && (
        <section aria-label={labels.images}>
          <Card
            title={labels.images}
            value={fill(labels.imagesValue, { used: data.images.used_today, limit: data.images.limit_per_day })}
            hint={fill(labels.imagesHint, { remaining: data.images.remaining })}
          />
        </section>
      )}

      <DailyChart lang={lang} labels={labels} data={data} money={money} metric={shown} onMetric={onMetric} />

      <div className="grid gap-4 md:grid-cols-2">
        <Breakdown
          title={labels.byModel}
          rows={data.by_model}
          total={totals.cost_usd}
          totalTokens={totals.input_tokens + totals.output_tokens}
          lang={lang}
          labels={labels}
          money={money}
          name={(bucket) => splitModelKey(bucket.key).model}
          sub={(bucket) => [splitModelKey(bucket.key).provider, bucket.local ? labels.local : ""].filter(Boolean).join(" · ")}
        />
        <Breakdown
          title={labels.bySource}
          rows={data.by_source}
          total={totals.cost_usd}
          totalTokens={totals.input_tokens + totals.output_tokens}
          lang={lang}
          labels={labels}
          money={money}
          name={(bucket) => labels.sources[bucket.key as keyof typeof labels.sources] ?? bucket.key}
        />
        <Breakdown
          title={labels.byProject}
          rows={data.by_project}
          total={totals.cost_usd}
          totalTokens={totals.input_tokens + totals.output_tokens}
          lang={lang}
          labels={labels}
          money={money}
          name={(bucket) => bucket.label ?? (bucket.key ? labels.projectGone : labels.noProject)}
        />
        {(data.by_agent?.length ?? 0) > 0 && (
          <Breakdown
            title={labels.byAgent}
            rows={data.by_agent ?? []}
            total={totals.cost_usd}
            totalTokens={totals.input_tokens + totals.output_tokens}
            lang={lang}
            labels={labels}
            money={money}
            name={(bucket) => bucket.label ?? labels.agentGone}
          />
        )}
        {data.top_conversations.length > 0 && (
          <section className="rounded-panel bg-surface p-5 shadow-card">
            <h2 className="text-label font-medium text-ink">{labels.topConversations}</h2>
            <ul className="mt-3 flex flex-col divide-y divide-border">
              {data.top_conversations.map((conversation) => (
                <li key={conversation.conversation_id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/${lang}/app/c/${conversation.conversation_id}`} className="min-w-0 truncate text-label text-ink no-underline hover:text-bordeaux-700">
                    {conversation.title ?? labels.conversationUntitled}
                  </Link>
                  <span className="shrink-0 text-secondary text-ink-2">{hasCost || conversation.cost_usd > 0 ? money(conversation.cost_usd) : formatTokens(conversation.input_tokens + conversation.output_tokens, lang)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <p className="text-meta text-ink-3 text-pretty">
        {labels.footnote}
        {data.currency.code !== "USD" && ` ${fill(labels.currencyNote, { code: data.currency.code, rate: data.currency.rate })}`}
      </p>
    </>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-panel bg-surface p-4 shadow-card">
      <p className="text-meta text-ink-3">{title}</p>
      <p className="text-panel-title font-medium text-ink">{value}</p>
      {hint && <p className="text-meta text-ink-3 text-pretty">{hint}</p>}
    </div>
  );
}

function DailyChart({ lang, labels, data, money, metric, onMetric }: { lang: Locale; labels: Labels; data: UsageSummary; money: Money; metric: "cost" | "tokens"; onMetric: (m: "cost" | "tokens") => void }) {
  const value = (day: UsageSummary["by_day"][number]) => (metric === "cost" ? day.cost_usd : day.input_tokens + day.output_tokens);
  const heights = barHeights(data.by_day, value);
  const text = (day: UsageSummary["by_day"][number]) => (metric === "cost" ? money(day.cost_usd) : formatTokens(day.input_tokens + day.output_tokens, lang));
  const last = data.by_day.length - 1;
  return (
    <section className="rounded-panel bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-label font-medium text-ink">{labels.chartTitle}</h2>
        <div role="group" aria-label={labels.chartTitle} className="inline-flex rounded-button bg-fill p-0.5">
          {(["cost", "tokens"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={metric === option}
              onClick={() => onMetric(option)}
              className={`rounded-badge px-2.5 py-1 text-meta ${metric === option ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}
            >
              {option === "cost" ? labels.metricCost : labels.metricTokens}
            </button>
          ))}
        </div>
      </div>
      <div role="img" aria-label={labels.chartLabel} className="mt-4 flex h-40 items-end gap-[2px]">
        {data.by_day.map((day, index) => (
          <div key={day.date} title={fill(labels.tooltip, { date: dayLabel(day.date, lang), value: text(day), requests: day.requests })} className="flex h-full min-w-0 flex-1 items-end">
            <div className="w-full rounded-t-[3px] bg-bordeaux-700/80 hover:bg-bordeaux-900" style={{ height: `${Math.round(heights[index] * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-meta text-ink-3" aria-hidden>
        <span>{dayLabel(data.by_day[0].date, lang)}</span>
        <span>{dayLabel(data.by_day[Math.floor(last / 2)].date, lang)}</span>
        <span>{dayLabel(data.by_day[last].date, lang)}</span>
      </div>
      <table className="sr-only">
        <caption>{labels.chartLabel}</caption>
        <tbody>
          {data.by_day.map((day) => (
            <tr key={day.date}>
              <th scope="row">{dayLabel(day.date, lang)}</th>
              <td>{text(day)}</td>
              <td>{fill(labels.requestsCount, { n: day.requests })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Breakdown({
  title,
  rows,
  total,
  totalTokens,
  lang,
  labels,
  money,
  name,
  sub,
}: {
  title: string;
  rows: UsageBucket[];
  total: number;
  totalTokens: number;
  lang: Locale;
  labels: Labels;
  money: Money;
  name: (bucket: UsageBucket) => string;
  sub?: (bucket: UsageBucket) => string;
}) {
  return (
    <section className="rounded-panel bg-surface p-5 shadow-card">
      <h2 className="text-label font-medium text-ink">{title}</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((bucket) => {
          const tokens = bucket.input_tokens + bucket.output_tokens;
          // La barre suit le coût ; sans aucun coût (modèles locaux seulement), elle suit les jetons.
          const share = total > 0 ? sharePercent(bucket.cost_usd, total) : sharePercent(tokens, totalTokens);
          return (
            <li key={bucket.key || "none"} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-label text-ink" title={name(bucket)}>
                  {name(bucket)}
                </span>
                <span className="shrink-0 text-secondary text-ink-2">
                  {bucket.estimated ? "≈ " : ""}
                  {bucket.unpriced && bucket.cost_usd === 0 ? labels.unknownCost : money(bucket.cost_usd)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden>
                <div className="h-full rounded-full bg-bordeaux-700/70" style={{ width: `${share}%` }} />
              </div>
              <p className="text-meta text-ink-3">
                {[sub?.(bucket), fill(labels.requestsCount, { n: bucket.requests }), `${formatTokens(tokens, lang)} tok`].filter(Boolean).join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Mon budget du mois : barre d'avancement, et — dès 80 % — ce que ça change (alerte, ou refus des nouvelles requêtes). */
function BudgetCard({ labels, lang, budget, money }: { labels: Labels; lang: Locale; budget: NonNullable<UsageSummary["budget"]>; money: Money }) {
  const message =
    budget.level === "exceeded"
      ? budget.block_at_limit
        ? labels.budgetExceededBlocking
        : labels.budgetExceededAlert
      : budget.level === "warn"
        ? fill(labels.budgetWarn, { percent: Math.round(budget.ratio * 100) })
        : null;
  return (
    <section className="flex flex-col gap-2 rounded-panel bg-surface p-5 shadow-card" aria-label={labels.budgetTitle}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-label font-medium text-ink">{labels.budgetTitle}</h2>
        <span className="text-meta text-ink-3">{budget.source === "default" ? labels.budgetDefault : labels.budgetOwn}</span>
      </div>
      <BudgetBar state={budget} money={money} lang={lang} labels={labels} />
      {message && (
        <p role="status" className={`rounded-badge px-3 py-2 text-secondary text-pretty ${budget.level === "exceeded" ? "bg-danger/[0.06] text-danger" : "bg-peche-100 text-bordeaux-900"}`}>
          {message}
        </p>
      )}
      <p className="text-meta text-ink-3">{labels.budgetMonthNote}</p>
    </section>
  );
}
