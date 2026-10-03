import type { ModelOut } from "./workspace-types";

export type Effort = "low" | "medium" | "high";
export const EFFORTS: Effort[] = ["low", "medium", "high"];
export type Tier = "eco" | "balanced" | "premium" | "free";
export const TIERS: Tier[] = ["eco", "balanced", "premium", "free"];

/** Choix de l'utilisateur : identifiant d'une entrée du catalogue serveur (jamais un nom libre) et effort facultatif. */
export type ModelChoice = { id: string; effort: Effort | null };

const isEffort = (value: unknown): value is Effort => typeof value === "string" && (EFFORTS as string[]).includes(value);

/** Relit un choix stocké ; tout ce qui n'a pas la bonne forme est ignoré (stockage modifié à la main, ancienne version). */
export function parseChoice(raw: string | null): ModelChoice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { id?: unknown; effort?: unknown };
    if (typeof value?.id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.id)) return null;
    return { id: value.id, effort: isEffort(value.effort) ? value.effort : null };
  } catch {
    return null;
  }
}

export const serializeChoice = (choice: ModelChoice | null): string | null => (choice ? JSON.stringify(choice) : null);

/** Le choix tel que le serveur le servira : le modèle doit exister dans la liste, l'effort n'a de sens que s'il raisonne. */
export function resolveChoice(choice: ModelChoice | null, models: ModelOut[] | null): { model: ModelOut; effort: Effort | null } | null {
  if (!choice || !models) return null;
  const model = models.find((m) => m.id === choice.id);
  return model ? { model, effort: model.reasoning ? choice.effort : null } : null;
}

/** Champs ajoutés à la requête de chat. Sans choix : rien (le serveur garde son modèle par défaut). */
export function requestFields(choice: ModelChoice | null): { model?: string; effort?: Effort } {
  if (!choice) return {};
  return choice.effort ? { model: choice.id, effort: choice.effort } : { model: choice.id };
}

/** Passe à un autre modèle en gardant l'effort s'il reste pertinent. */
export function selectModel(current: ModelChoice | null, model: ModelOut): ModelChoice {
  return { id: model.id, effort: model.reasoning ? (current?.effort ?? null) : null };
}

export function groupByTier(models: ModelOut[]): { tier: Tier; models: ModelOut[] }[] {
  return TIERS.map((tier) => ({ tier, models: models.filter((m) => m.tier === tier) })).filter((group) => group.models.length > 0);
}

// Message type d'un tour de DONNA, mesuré dans les journaux : environ 5 000 tokens en entrée, 500 en sortie.
const TYPICAL_IN = 5_000;
const TYPICAL_OUT = 500;

/** Coût estimé d'un message en dollars ; null si le tarif n'est pas connu (fournisseur direct, gratuit). */
export function estimatedCost(model: Pick<ModelOut, "price_in" | "price_out">): number | null {
  if (model.price_in == null || model.price_out == null) return null;
  return (TYPICAL_IN * model.price_in + TYPICAL_OUT * model.price_out) / 1_000_000;
}

/** « 0,00027 » : deux chiffres significatifs, jamais de notation scientifique. */
export function formatCost(cost: number, lang: string): string {
  return new Intl.NumberFormat(lang, { maximumSignificantDigits: 2, maximumFractionDigits: 6 }).format(cost);
}
