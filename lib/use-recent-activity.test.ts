// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POLL_MS, type ActivityItem } from "./activity";
import { RESEARCH_URL, useRecentActivity, WORKFLOW_RUNS_URL } from "./use-recent-activity";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date("2026-10-09T12:00:00Z");
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();
const MIN = 60_000;

const run = (id: string, status: string, startedAgo = 5 * MIN) => ({
  id, workflow_id: "wf", workflow_name: `Auto ${id}`, status, trigger: "schedule", error: null,
  started_at: iso(startedAgo), finished_at: status === "running" ? null : iso(startedAgo - MIN), conversation_id: null,
});
const search = (id: string, status: string) => ({
  id, conversation_id: "c", question: `Q ${id}`, status, pages_read: 1, pages_failed: 0, cost_usd: null, report_message_id: null,
  created_at: iso(30 * MIN), finished_at: status === "running" ? null : iso(20 * MIN),
});

/** Réponses du « serveur » par adresse : une liste, ou une panne (null). */
let server: { workflows: unknown; research: unknown };
const calls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

let host: HTMLElement;
let root: Root;

/** Ce que le hook renvoie, écrit dans le DOM : le test le relit, sans variable partagée avec le composant. */
function Probe({ refreshKey }: { refreshKey: string }) {
  return createElement("pre", null, JSON.stringify(useRecentActivity(refreshKey)));
}
const seen = (): ActivityItem[] | null => JSON.parse(host.querySelector("pre")?.textContent ?? "null");
const mount = (key = "a") =>
  act(async () => {
    root.render(createElement(Probe, { refreshKey: key }));
  });
const titles = () => seen()?.map((i) => i.title);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  server = { workflows: [], research: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = url === WORKFLOW_RUNS_URL ? server.workflows : url === RESEARCH_URL ? server.research : [];
      return body === null ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => body };
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useRecentActivity", () => {
  it("est null avant la première réponse, puis donne les deux sources fusionnées", async () => {
    server = { workflows: [run("w1", "succeeded")], research: [search("r1", "done")] };
    await mount();
    expect(titles()).toEqual(["Auto w1", "Q r1"]); // w1 a fini il y a 4 min, r1 il y a 20
  });

  it("ne relit PAS quand rien ne tourne", async () => {
    server = { workflows: [run("w1", "succeeded")], research: [] };
    await mount();
    const initial = calls();
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS * 4);
    });
    expect(calls()).toBe(initial);
  });

  it("relit tant qu'un travail tourne, et s'arrête dès qu'il est fini", async () => {
    server = { workflows: [run("w1", "running")], research: [] };
    await mount();
    expect(seen()?.[0].state).toBe("running");
    const afterFirst = calls();

    server = { workflows: [run("w1", "succeeded")], research: [] };
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(calls()).toBeGreaterThan(afterFirst);
    expect(seen()?.[0].state).toBe("done"); // la ligne est passée d'« en cours » à « terminé » sans rechargement

    const afterDone = calls();
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS * 4);
    });
    expect(calls()).toBe(afterDone);
  });

  it("relit quand la clé change (une notification vient d'arriver)", async () => {
    server = { workflows: [], research: [] };
    await mount("a");
    expect(seen()).toEqual([]);
    server = { workflows: [run("w2", "succeeded")], research: [] };
    await mount("b");
    expect(titles()).toEqual(["Auto w2"]);
  });

  it("une source en panne ne vide pas l'autre", async () => {
    server = { workflows: null, research: [search("r1", "done")] };
    await mount();
    expect(titles()).toEqual(["Q r1"]);
  });

  it("garde la dernière liste connue quand une relecture échoue", async () => {
    server = { workflows: [run("w1", "succeeded")], research: [] };
    await mount("a");
    server = { workflows: null, research: null };
    await mount("b");
    expect(titles()).toEqual(["Auto w1"]);
  });

  it("n'accepte qu'une liste : une réponse d'une autre forme est ignorée", async () => {
    server = { workflows: { detail: "oups" }, research: [search("r1", "done")] };
    await mount();
    expect(titles()).toEqual(["Q r1"]);
  });

  it("ne met plus rien à jour une fois démonté", async () => {
    server = { workflows: [run("w1", "running")], research: [] };
    await mount();
    await act(async () => root.unmount());
    const after = calls();
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS * 4);
    });
    expect(calls()).toBe(after);
    root = createRoot(host); // pour l'afterEach
  });
});
