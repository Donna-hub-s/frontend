import { describe, expect, it } from "vitest";
import { hasLiveWork, LIVE_MS, MAX_ACTIVITY, recentActivity, WINDOW_MS, type ResearchSummary, type WorkflowRunSummary } from "./activity";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const wf = (over: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary => ({
  id: "w1",
  workflow_id: "wf",
  workflow_name: "Briefing du matin",
  status: "succeeded",
  trigger: "schedule",
  error: null,
  started_at: ago(2 * HOUR),
  finished_at: ago(2 * HOUR - 30_000),
  conversation_id: "conv-1",
  ...over,
});

const rs = (over: Partial<ResearchSummary> = {}): ResearchSummary => ({
  id: "r1",
  conversation_id: "conv-2",
  question: "Taille du marché ?",
  status: "done",
  pages_read: 4,
  pages_failed: 0,
  cost_usd: 0.12,
  report_message_id: "m1",
  created_at: ago(3 * HOUR),
  finished_at: ago(3 * HOUR - 10 * MIN),
  ...over,
});

describe("activité récente", () => {
  it("fusionne les deux sources, la plus fraîche d'abord (rangée par FIN, sinon par début)", () => {
    const list = recentActivity(
      [wf({ id: "vieux", workflow_name: "Vieux", started_at: ago(10 * HOUR), finished_at: ago(10 * HOUR - MIN) })],
      [rs({ id: "long", question: "Longue", created_at: ago(5 * HOUR), finished_at: ago(HOUR) })],
      NOW,
    );
    expect(list.map((i) => i.title)).toEqual(["Longue", "Vieux"]); // la recherche commencée plus tôt a FINI plus tard
  });

  it("ramène les mots des deux sources à un seul vocabulaire", () => {
    const list = recentActivity(
      [wf({ id: "a", status: "succeeded" }), wf({ id: "b", status: "failed" }), wf({ id: "c", status: "skipped" }), wf({ id: "d", status: "running", finished_at: null })],
      [rs({ id: "e", status: "done" }), rs({ id: "f", status: "cancelled" }), rs({ id: "g", status: "interrupted" })],
      NOW,
      20,
    );
    const states = Object.fromEntries(list.map((i) => [i.key, i.state]));
    expect(states).toEqual({
      "workflow:a": "done", "workflow:b": "failed", "workflow:c": "skipped", "workflow:d": "running",
      "research:e": "done", "research:f": "cancelled", "research:g": "interrupted",
    });
  });

  it("un statut inconnu devient neutre — jamais « terminé »", () => {
    const [w] = recentActivity([wf({ status: "quantum" })], [], NOW);
    const [r] = recentActivity([], [rs({ status: "quantum" })], NOW);
    expect([w.state, r.state]).toEqual(["skipped", "interrupted"]);
  });

  it("n'appelle pas « récent » ce qui a plus d'une semaine", () => {
    const list = recentActivity(
      [wf({ id: "hier", started_at: ago(DAY), finished_at: ago(DAY) }), wf({ id: "ancien", started_at: ago(WINDOW_MS + MIN), finished_at: ago(WINDOW_MS + MIN) })],
      [],
      NOW,
    );
    expect(list.map((i) => i.key)).toEqual(["workflow:hier"]);
  });

  it("une fenêtre qui ne retient rien donne une liste vide, pas une erreur", () => {
    expect(recentActivity([], [], NOW)).toEqual([]);
  });

  it("ne dépasse jamais le plafond", () => {
    const many = Array.from({ length: 12 }, (_, i) => wf({ id: `w${i}`, started_at: ago((i + 1) * HOUR), finished_at: ago((i + 1) * HOUR) }));
    expect(recentActivity(many, [], NOW)).toHaveLength(MAX_ACTIVITY);
    expect(recentActivity(many, [], NOW, 2).map((i) => i.key)).toEqual(["workflow:w0", "workflow:w1"]);
  });

  it("une ligne sans date lisible est écartée au lieu de planter le tri", () => {
    const list = recentActivity([wf({ id: "casse", started_at: "pas une date" }), wf({ id: "ok" })], [], NOW);
    expect(list.map((i) => i.key)).toEqual(["workflow:ok"]);
  });

  it("lit les dates du serveur, UTC sans fuseau comprises", () => {
    const naive = new Date(NOW - HOUR).toISOString().replace("Z", "");
    const [one] = recentActivity([wf({ started_at: naive, finished_at: naive })], [], NOW);
    expect(one.startedAt).toBe(NOW - HOUR);
  });

  it("un travail en cours n'a pas de fin, même si le serveur en envoyait une", () => {
    const [running] = recentActivity([wf({ status: "running", finished_at: ago(MIN) })], [], NOW);
    expect(running.endedAt).toBeNull();
    expect(running.at).toBe(running.startedAt);
  });

  it("un travail terminé garde son début et sa fin (de quoi afficher sa durée)", () => {
    const [done] = recentActivity([wf({ started_at: ago(HOUR), finished_at: ago(HOUR - 90_000) })], [], NOW);
    expect(done.endedAt! - done.startedAt).toBe(90_000);
  });

  it("une automatisation sans conversation n'en invente pas ; une recherche en a toujours une", () => {
    const [w] = recentActivity([wf({ conversation_id: null })], [], NOW);
    const [r] = recentActivity([], [rs()], NOW);
    expect([w.conversationId, r.conversationId]).toEqual([null, "conv-2"]);
  });

  it("un identifiant de run et un de recherche identiques ne se confondent pas", () => {
    const list = recentActivity([wf({ id: "x" })], [rs({ id: "x" })], NOW);
    expect(new Set(list.map((i) => i.key)).size).toBe(2);
  });

  it("ne modifie pas les tableaux reçus", () => {
    const workflows = [wf({ id: "a", started_at: ago(5 * HOUR) }), wf({ id: "b", started_at: ago(HOUR) })];
    const copy = [...workflows];
    recentActivity(workflows, [], NOW);
    expect(workflows).toEqual(copy);
  });
});

describe("travail en cours", () => {
  const live = (workflows: WorkflowRunSummary[], research: ResearchSummary[] = []) => hasLiveWork(recentActivity(workflows, research, NOW, 20), NOW);

  it("détecte un travail qui tourne dans l'une ou l'autre source", () => {
    expect(live([wf({ status: "running", started_at: ago(MIN), finished_at: null })])).toBe(true);
    expect(live([], [rs({ status: "running", created_at: ago(MIN), finished_at: null })])).toBe(true);
  });

  it("ne relit pas quand tout est fini", () => {
    expect(live([wf(), wf({ status: "failed" })], [rs(), rs({ status: "cancelled" })])).toBe(false);
    expect(live([])).toBe(false);
  });

  it("ne relit pas indéfiniment une ligne restée « en cours » depuis longtemps", () => {
    const stuck = wf({ status: "running", started_at: ago(LIVE_MS + MIN), finished_at: null });
    expect(live([stuck])).toBe(false);
  });
});
