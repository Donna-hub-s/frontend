// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import type { ActivityItem } from "@/lib/activity";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Le fournisseur de l'espace de travail et la relecture serveur sont remplacés : on teste CE QUI S'AFFICHE, pas le réseau.
let items: ActivityItem[] | null = null;
vi.mock("./workspace-provider", () => ({ useWorkspace: () => ({ reminders: [] }) }));
vi.mock("@/lib/use-recent-activity", () => ({ useRecentActivity: () => items }));

import { HomeActivity } from "./home-activity";

const NOW = new Date("2026-10-09T12:00:00Z").getTime();
const MIN = 60_000;
const entry = (over: Partial<ActivityItem>): ActivityItem => ({
  key: "workflow:1", kind: "workflow", title: "Briefing du matin", state: "done", startedAt: NOW - 10 * MIN, endedAt: NOW - 9 * MIN, at: NOW - 9 * MIN,
  conversationId: "conv-1", ...over,
});

let host: HTMLElement;
let root: Root;
const render = () =>
  act(async () => {
    root.render(createElement(HomeActivity, { lang: "fr", dict: fr.workspace as never }));
  });
const rows = () => [...host.querySelectorAll("li")];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  items = null;
});

describe("HomeActivity", () => {
  it("ne montre rien avant la première réponse, ni quand il n'y a rien à dire", async () => {
    items = null;
    await render();
    expect(host.innerHTML).toBe("");
    items = [];
    await render();
    expect(host.innerHTML).toBe(""); // jamais de « aucune activité »
  });

  it("dit ce qui s'est passé, avec le type, l'état accordé au féminin et la durée", async () => {
    items = [entry({}), entry({ key: "research:1", kind: "research", title: "Taille du marché ?", state: "failed", conversationId: "conv-2" })];
    await render();
    expect(host.querySelector("h2")?.textContent).toBe("Activité récente");
    const [workflow, research] = rows().map((li) => li.textContent);
    expect(workflow).toContain("Briefing du matin");
    expect(workflow).toContain("Automatisation · Terminée · 1 min 00");
    expect(research).toContain("Recherche · Échec");
  });

  it("renvoie vers la conversation du résultat, ou vers les automatisations tant qu'elle n'existe pas", async () => {
    items = [entry({}), entry({ key: "workflow:2", conversationId: null })];
    await render();
    expect([...host.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/fr/app/c/conv-1", "/fr/app/workflows"]);
  });

  it("un travail en cours montre depuis combien de temps il tourne, et le temps avance", async () => {
    items = [entry({ key: "research:9", kind: "research", state: "running", startedAt: NOW - 90_000, endedAt: null, at: NOW - 90_000 })];
    await render();
    expect(rows()[0].textContent).toContain("Recherche · En cours · 1 min 30");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(rows()[0].textContent).toContain("En cours · 2 min 00");
  });

  it("un travail en cours depuis quelques secondes reste muet (pas de compteur qui clignote)", async () => {
    items = [entry({ state: "running", startedAt: NOW - 2_000, endedAt: null, at: NOW - 2_000 })];
    await render();
    expect(rows()[0].textContent).toContain("Automatisation · En cours");
    expect(rows()[0].textContent).not.toMatch(/\d+ s\b/);
  });

  it("n'affiche que du texte du dictionnaire pour l'état, jamais le statut brut du serveur", async () => {
    items = [entry({ state: "interrupted" }), entry({ key: "workflow:3", state: "skipped" })];
    await render();
    expect(host.textContent).toContain("Interrompue");
    expect(host.textContent).toContain("Non lancée");
  });
});
