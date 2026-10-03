// Tableau de bord « Ma consommation » — GET /app/chat/usage/me (backend/app/chat/src/routes/usage_routes.py).

export type UsageCurrency = { code: string; rate: number };
export type UsageTotals = {
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  requests: number;
  calls: number;
  tool_rounds: number;
  sandbox_seconds: number;
  /** Au moins une ligne a des jetons estimés (le fournisseur ne les a pas annoncés). */
  estimated: boolean;
  /** Au moins une ligne a un coût inconnu (modèle hors catalogue) : le total est alors un minimum. */
  unpriced: boolean;
};
export type UsageDay = { date: string; cost_usd: number; input_tokens: number; output_tokens: number; requests: number };
export type UsageBucket = {
  key: string;
  label: string | null;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  requests: number;
  estimated: boolean;
  unpriced: boolean;
  local: boolean;
};
export type UsageConversation = { conversation_id: string; title: string | null; cost_usd: number; input_tokens: number; output_tokens: number; requests: number };
/** Où en est un utilisateur ce mois-ci (mois civil UTC) face à son budget — backend/app/chat/src/budgets.py. */
export type UsageBudgetState = {
  source: "user" | "default" | string;
  limit_cost_usd: number | null;
  limit_tokens: number | null;
  block_at_limit: boolean;
  used_cost_usd: number;
  used_tokens: number;
  ratio: number;
  level: "ok" | "warn" | "exceeded" | string;
  month: string;
};
export type UsageBudgetRow = { user_id: string; limit_cost_usd: number | null; limit_tokens: number | null; block_at_limit: boolean; updated_by: string | null; updated_at: string | null };
export type TeamMember = {
  user_id: string;
  email: string | null;
  is_owner: boolean;
  is_active: boolean;
  former: boolean;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  requests: number;
  estimated: boolean;
  unpriced: boolean;
  budget: UsageBudgetState | null;
};
export type UsageTeam = {
  period: UsageSummary["period"];
  currency: UsageCurrency;
  totals: UsageTotals;
  by_day: UsageDay[];
  members: TeamMember[];
  default_budget: UsageBudgetRow | null;
  directory_ok: boolean;
};
export type UsageImageQuota = { used_today: number; limit_per_day: number; remaining: number };

export type UsageSummary = {
  period: { from: string; to: string; days: number; timezone: string };
  currency: UsageCurrency;
  totals: UsageTotals;
  by_day: UsageDay[];
  by_model: UsageBucket[];
  by_source: UsageBucket[];
  by_project: UsageBucket[];
  /** Tours faits avec un agent de projet (label = son nom, absent si on a quitté le projet). */
  by_agent?: UsageBucket[];
  top_conversations: UsageConversation[];
  budget: UsageBudgetState | null;
  /** Images du jour (UTC) ; absent quand la génération d'images est fermée sur ce serveur. */
  images?: UsageImageQuota | null;
  /** Administrateur de l'espace : l'onglet « Équipe » est disponible. */
  is_admin: boolean;
};

export const PERIOD_OPTIONS = [7, 30, 90] as const;
export const DEFAULT_PERIOD = 30;

export const usageUrl = (days: number, timezone: string): string => `/api/donna/chat/usage/me?days=${days}&tz=${encodeURIComponent(timezone)}`;

/**
 * Montants : les coûts arrivent en dollars, on les multiplie par le taux de la devise d'affichage. Un montant plus petit que
 * la plus petite unité de la devise s'écrit « < 0,01 $ » plutôt que « 0,00 $ » (qui ferait croire à de la gratuité).
 */
export function moneyFormatter(currency: UsageCurrency, locale: string): (usd: number) => string {
  let format: Intl.NumberFormat;
  try {
    format = new Intl.NumberFormat(locale, { style: "currency", currency: currency.code });
  } catch {
    format = new Intl.NumberFormat(locale, { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  const smallest = 10 ** -digits;
  const suffix = format.resolvedOptions().style === "currency" ? "" : ` ${currency.code}`;
  return (usd: number) => {
    const value = usd * currency.rate;
    if (value === 0) return `${format.format(0)}${suffix}`;
    if (Math.abs(value) < smallest) return `< ${format.format(smallest)}${suffix}`;
    return `${format.format(value)}${suffix}`;
  };
}

/** 1 234 → « 1,2 k » (selon la langue) ; les petits nombres restent entiers. */
export function formatTokens(count: number, locale: string): string {
  if (count < 1000) return new Intl.NumberFormat(locale).format(count);
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

/** Hauteur relative (0 à 1) de la barre de chaque jour. Un jour non vide garde une barre visible (MIN_BAR). */
export const MIN_BAR = 0.04;
export function barHeights(days: UsageDay[], pick: (day: UsageDay) => number): number[] {
  const max = Math.max(0, ...days.map(pick));
  if (max <= 0) return days.map(() => 0);
  return days.map((day) => {
    const value = pick(day);
    return value <= 0 ? 0 : Math.max(MIN_BAR, value / max);
  });
}

/** « 2026-10-03 » → « 3 oct. » : la date est celle du jour LOCAL de l'utilisateur, on ne la décale donc jamais. */
export function dayLabel(date: string, locale: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(parsed);
}

/** Part d'un total en pourcentage entier (0 si le total est nul). */
export const sharePercent = (part: number, total: number): number => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Fournisseur et modèle d'une clé « fournisseur/modèle » (le modèle peut lui-même contenir des « / »). */
export function splitModelKey(key: string): { provider: string; model: string } {
  const index = key.indexOf("/");
  return index === -1 ? { provider: "", model: key } : { provider: key.slice(0, index), model: key.slice(index + 1) };
}

/** Aucune requête sur la période : l'écran montre un état vide plutôt qu'un tableau de zéros. */
export const isEmptyUsage = (summary: UsageSummary): boolean => summary.totals.requests === 0;

/** Fuseau du navigateur : les jours du tableau de bord sont ceux de l'utilisateur (minuit à minuit chez lui). */
export const browserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

// ── Équipe et budgets ─────────────────────────────────────────────────────────

export const teamUrl = (days: number, timezone: string): string => `/api/donna/chat/usage/tenant?days=${days}&tz=${encodeURIComponent(timezone)}`;
export const teamExportUrl = (days: number, timezone: string): string => `/api/donna/chat/usage/tenant/export?days=${days}&tz=${encodeURIComponent(timezone)}`;
/** « * » désigne le budget par défaut de l'espace (membres sans budget propre). */
export const DEFAULT_BUDGET_USER = "*";
export const budgetUrl = (userId: string): string => `/api/donna/chat/usage/budgets/${encodeURIComponent(userId)}`;

/** Avancement en pourcentage entier, jamais négatif ; la barre se plafonne à 100 mais le texte dit la vérité (« 132 % »). */
export const budgetPercent = (ratio: number): number => Math.max(0, Math.round(ratio * 100));
export const budgetBarWidth = (ratio: number): number => Math.min(100, budgetPercent(ratio));

export type BudgetTone = "ok" | "warn" | "exceeded";
export const budgetTone = (state: Pick<UsageBudgetState, "level"> | null): BudgetTone => (state?.level === "exceeded" ? "exceeded" : state?.level === "warn" ? "warn" : "ok");

/**
 * Saisie d'un montant dans la devise d'affichage → dollars (les budgets sont stockés en dollars). Accepte la virgule
 * décimale et les espaces (« 1 250,5 »). Vide → null (pas de limite) ; invalide ou négatif → undefined.
 */
export function parseLimit(input: string, rate: number): number | null | undefined {
  const cleaned = input.trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || !(rate > 0)) return undefined;
  return Math.round((value / rate) * 1e6) / 1e6;
}

/** Entier de jetons saisi (« 5 000 000 »). Vide → null ; invalide → undefined. */
export function parseTokens(input: string): number | null | undefined {
  const cleaned = input.trim().replace(/[\s\u00a0\u202f]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** Valeur à remettre dans le champ d'édition : dollars → devise d'affichage, sans décimales superflues. */
export function limitToInput(usd: number | null, rate: number): string {
  if (usd === null) return "";
  const value = Math.round(usd * rate * 100) / 100;
  return String(value);
}
