import { describe, expect, it } from "vitest";
import {
  barHeights, budgetBarWidth, budgetPercent, budgetTone, budgetUrl, dayLabel, formatTokens, isEmptyUsage, limitToInput, MIN_BAR, moneyFormatter,
  parseLimit, parseTokens, sharePercent, splitModelKey, teamExportUrl, teamUrl, usageUrl, type UsageDay, type UsageSummary,
} from "./usage";

const day = (date: string, cost: number): UsageDay => ({ date, cost_usd: cost, input_tokens: 0, output_tokens: 0, requests: 0 });

describe("moneyFormatter", () => {
  it("affiche un montant en dollars dans la langue de l'interface", () => {
    const usd = moneyFormatter({ code: "USD", rate: 1 }, "fr");
    expect(usd(12.5).replace(/\s/g, " ")).toMatch(/12,50\s?\$US|12,50\s?\$/);
    expect(moneyFormatter({ code: "USD", rate: 1 }, "en")(12.5)).toBe("$12.50");
  });

  it("applique le taux de la devise d'affichage", () => {
    expect(moneyFormatter({ code: "USD", rate: 2 }, "en")(1.25)).toBe("$2.50");
    // franc CFA : pas de décimales, un dollar vaut ~600 F
    expect(moneyFormatter({ code: "XOF", rate: 600 }, "fr")(0.5).replace(/\s/g, " ")).toMatch(/300/);
  });

  it("n'écrit jamais « 0,00 » pour un coût non nul : « < 0,01 »", () => {
    const usd = moneyFormatter({ code: "USD", rate: 1 }, "en");
    expect(usd(0.0004)).toBe("< $0.01");
    expect(usd(0)).toBe("$0.00");
    expect(moneyFormatter({ code: "XOF", rate: 600 }, "fr")(0.0004).replace(/\s/g, " ")).toMatch(/^< /);
  });

  it("retombe sur un nombre et le code quand la devise est inconnue", () => {
    expect(moneyFormatter({ code: "ZZZ", rate: 1 }, "en")(3)).toMatch(/3\.00/);
    expect(moneyFormatter({ code: "???", rate: 1 }, "en")(3)).toBe("3.00 ???");
  });
});

describe("formatTokens", () => {
  it("garde les petits nombres entiers et abrège les grands", () => {
    expect(formatTokens(950, "en")).toBe("950");
    expect(formatTokens(1234, "en")).toBe("1.2K");
    expect(formatTokens(2_500_000, "en")).toBe("2.5M");
  });
});

describe("barHeights", () => {
  it("met à l'échelle du jour le plus fort, un jour non vide garde une barre visible", () => {
    const days = [day("a", 0), day("b", 0.001), day("c", 10), day("d", 5)];
    const heights = barHeights(days, (d) => d.cost_usd);
    expect(heights[0]).toBe(0);
    expect(heights[1]).toBe(MIN_BAR);
    expect(heights[2]).toBe(1);
    expect(heights[3]).toBeCloseTo(0.5);
  });

  it("une période sans rien donne des barres nulles (pas de division par zéro)", () => {
    expect(barHeights([day("a", 0), day("b", 0)], (d) => d.cost_usd)).toEqual([0, 0]);
    expect(barHeights([], (d) => d.cost_usd)).toEqual([]);
  });
});

describe("dayLabel", () => {
  it("n'applique aucun décalage de fuseau à une date locale", () => {
    expect(dayLabel("2026-10-03", "en")).toBe("Oct 3");
    expect(dayLabel("2026-01-01", "en")).toBe("Jan 1");
    expect(dayLabel("pas-une-date", "en")).toBe("pas-une-date");
  });
});

describe("petits utilitaires", () => {
  it("sharePercent", () => {
    expect(sharePercent(1, 4)).toBe(25);
    expect(sharePercent(5, 0)).toBe(0);
  });

  it("splitModelKey garde les « / » du nom de modèle", () => {
    expect(splitModelKey("openrouter/deepseek/deepseek-chat")).toEqual({ provider: "openrouter", model: "deepseek/deepseek-chat" });
    expect(splitModelKey("seul")).toEqual({ provider: "", model: "seul" });
  });

  it("usageUrl encode le fuseau", () => {
    expect(usageUrl(30, "Europe/Paris")).toBe("/api/donna/chat/usage/me?days=30&tz=Europe%2FParis");
  });

  it("isEmptyUsage", () => {
    const empty = { totals: { requests: 0 } } as UsageSummary;
    expect(isEmptyUsage(empty)).toBe(true);
    expect(isEmptyUsage({ totals: { requests: 3 } } as UsageSummary)).toBe(false);
  });
});

describe("budgets", () => {
  it("le pourcentage dit la vérité, la barre se plafonne", () => {
    expect(budgetPercent(0.804)).toBe(80);
    expect(budgetPercent(1.32)).toBe(132);
    expect(budgetBarWidth(1.32)).toBe(100);
    expect(budgetBarWidth(-1)).toBe(0);
  });

  it("le ton suit le niveau du serveur", () => {
    expect(budgetTone({ level: "exceeded" })).toBe("exceeded");
    expect(budgetTone({ level: "warn" })).toBe("warn");
    expect(budgetTone({ level: "ok" })).toBe("ok");
    expect(budgetTone(null)).toBe("ok");
  });

  it("parseLimit convertit la devise d'affichage en dollars, vide = sans limite, invalide = refusé", () => {
    expect(parseLimit("12,5", 1)).toBe(12.5);
    expect(parseLimit("1 250", 1)).toBe(1250);
    expect(parseLimit("600", 600)).toBe(1);
    expect(parseLimit("300", 600)).toBe(0.5);
    expect(parseLimit("   ", 1)).toBeNull();
    for (const bad of ["abc", "-5", "1e3", "12,5,3", "12 $"]) expect(parseLimit(bad, 1)).toBeUndefined();
    expect(parseLimit("5", 0)).toBeUndefined();
  });

  it("parseTokens n'accepte que des entiers", () => {
    expect(parseTokens("5 000 000")).toBe(5_000_000);
    expect(parseTokens("")).toBeNull();
    for (const bad of ["1,5", "-1", "dix", "9".repeat(20)]) expect(parseTokens(bad)).toBeUndefined();
  });

  it("limitToInput reconvertit en devise d'affichage", () => {
    expect(limitToInput(null, 1)).toBe("");
    expect(limitToInput(1, 600)).toBe("600");
    expect(limitToInput(12.5, 1)).toBe("12.5");
  });

  it("les adresses encodent fuseau et membre", () => {
    expect(teamUrl(7, "Africa/Ouagadougou")).toBe("/api/donna/chat/usage/tenant?days=7&tz=Africa%2FOuagadougou");
    expect(teamExportUrl(30, "UTC")).toBe("/api/donna/chat/usage/tenant/export?days=30&tz=UTC");
    expect(budgetUrl("*")).toBe("/api/donna/chat/usage/budgets/*");
    expect(budgetUrl("a/b")).toBe("/api/donna/chat/usage/budgets/a%2Fb");
  });
});
