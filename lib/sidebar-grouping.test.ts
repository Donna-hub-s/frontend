import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupByDate, groupByProject, NO_PROJECT } from "./sidebar-grouping";
import type { ConversationOut, ProjectOut } from "./workspace-types";

const conv = (id: string, overrides: Partial<ConversationOut> = {}): ConversationOut => ({
  id,
  title: id,
  created_at: new Date().toISOString(),
  ...overrides,
});

const project = (id: string, name = id): ProjectOut =>
  ({ id, name }) as ProjectOut;

describe("groupByProject", () => {
  it("regroupe chaque conversation sous son projet, dans l'ordre des projets", () => {
    const projects = [project("p1", "Alpha"), project("p2", "Beta")];
    const conversations = [conv("c1", { project_id: "p2" }), conv("c2", { project_id: "p1" })];

    const groups = groupByProject(conversations, projects, "Sans projet");

    expect(groups.map((g) => g.key)).toEqual(["p1", "p2"]);
    expect(groups[0].items.map((c) => c.id)).toEqual(["c2"]);
    expect(groups[1].items.map((c) => c.id)).toEqual(["c1"]);
  });

  it("isole les conversations sans projet (ou pointant sur un projet inconnu) sous NO_PROJECT", () => {
    const projects = [project("p1")];
    const conversations = [
      conv("c1", { project_id: null }),
      conv("c2", { project_id: "p1" }),
      // Bug historique corrigé : project_id présent mais absent de la liste des
      // projets connus (ex: projet supprimé, ou upsert optimiste sans project_id) —
      // ne doit jamais planter, ni disparaître silencieusement.
      conv("c3", { project_id: "unknown" }),
    ];

    const groups = groupByProject(conversations, projects, "Sans projet");

    const noProject = groups.find((g) => g.key === NO_PROJECT);
    expect(noProject?.label).toBe("Sans projet");
    expect(noProject?.items.map((c) => c.id).sort()).toEqual(["c1", "c3"]);
  });

  it("omet un projet sans aucune conversation rattachée (pas de groupe vide)", () => {
    const projects = [project("p1"), project("p2")];
    const conversations = [conv("c1", { project_id: "p1" })];

    const groups = groupByProject(conversations, projects, "Sans projet");

    expect(groups.map((g) => g.key)).toEqual(["p1"]);
  });

  it("n'ajoute pas de groupe NO_PROJECT si toutes les conversations sont rattachées", () => {
    const projects = [project("p1")];
    const conversations = [conv("c1", { project_id: "p1" })];

    const groups = groupByProject(conversations, projects, "Sans projet");

    expect(groups.some((g) => g.key === NO_PROJECT)).toBe(false);
  });
});

describe("groupByDate", () => {
  const labels = { today: "Aujourd'hui", yesterday: "Hier", week: "Cette semaine", earlier: "Plus ancien" };

  // Horloge figée en milieu d'après-midi (heure locale, via les composants du
  // constructeur Date, pas un instant UTC) : un "il y a 1,5 jour" relatif à
  // `Date.now()` ne tombe dans le bucket "yesterday" (calé sur minuit local)
  // que si l'heure du jour au moment du test est postérieure à midi — sans
  // horloge figée, ce test était vrai l'après-midi et faux le matin.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 15, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("classe une conversation d'aujourd'hui dans le bucket today", () => {
    const groups = groupByDate([conv("c1", { created_at: new Date().toISOString() })], labels);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "today", label: "Aujourd'hui" });
  });

  it("classe une conversation d'il y a 10 jours dans earlier, pas week", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const groups = groupByDate([conv("c1", { created_at: tenDaysAgo })], labels);
    expect(groups.map((g) => g.key)).toEqual(["earlier"]);
  });

  it("omet les buckets vides et préserve l'ordre today→yesterday→week→earlier", () => {
    const yesterday = new Date(Date.now() - 1.5 * 86_400_000).toISOString();
    const groups = groupByDate(
      [conv("c1", { created_at: new Date().toISOString() }), conv("c2", { created_at: yesterday })],
      labels,
    );
    expect(groups.map((g) => g.key)).toEqual(["today", "yesterday"]);
  });
});
