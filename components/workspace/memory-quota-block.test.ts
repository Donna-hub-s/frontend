// @vitest-environment jsdom
// Jauge de la mémoire d'un projet et réglage des plafonds : l'usage vient du serveur, le propriétaire règle le projet, le responsable de
// l'espace règle tous les projets, le plafond possible est montré, une saisie invalide n'est pas envoyée. Le réseau est doublé.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import type { ProjectQuotas, WorkspaceQuotas } from "@/lib/memory-quotas";
import { MemoryQuotaBlock } from "./memory-quota-block";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = fr.workspace.projects;
const q = labels.memoryQuota;

const level = (env: number | null, tenant: number | null, project: number | null, effective: number | null) => ({ env, tenant, project, effective });
const project = (over: Partial<ProjectQuotas> = {}): ProjectQuotas => ({
  limits: {
    facts_max: level(200, null, null, 200),
    fact_chars_max: level(2000, null, null, 2000),
    memory_prompt_chars_max: level(400_000, null, null, 400_000),
    model_writes_per_day: level(null, null, null, null),
  },
  usage: { facts: 50, chars: 10_000, model_writes_today: 2 },
  can_set: false,
  ...over,
});
const space = (): WorkspaceQuotas => ({
  limits: {
    facts_max: { env: 200, tenant: null },
    fact_chars_max: { env: 2000, tenant: null },
    memory_prompt_chars_max: { env: 400_000, tenant: null },
    model_writes_per_day: { env: null, tenant: null },
  },
  can_set: true,
});

let host: HTMLElement;
let root: Root;
let state: { project: ProjectQuotas; workspace: WorkspaceQuotas | null; calls: { method: string; url: string; body?: unknown }[]; reject: boolean };

const respond = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  state = { project: project(), workspace: null, calls: [], reject: false };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      state.calls.push({ method, url, body });
      const isWorkspace = url.endsWith("/workspace/quotas");
      if (isWorkspace && !state.workspace) return respond({ detail: "interdit" }, 403);
      if (method === "PUT") {
        if (state.reject) return respond({ detail: "non" }, 400);
        if (isWorkspace) return respond(state.workspace);
        const facts = body.limits.facts_max;
        state.project = project({ ...state.project, limits: { ...state.project.limits, facts_max: level(200, null, facts, facts ?? 200) } });
        return respond(state.project);
      }
      return respond(isWorkspace ? state.workspace : state.project);
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function mount() {
  act(() => {
    root.render(createElement(MemoryQuotaBlock, { labels, projectId: "p1" }));
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
const click = async (el: Element | undefined | null) => {
  expect(el).toBeTruthy();
  await act(async () => void el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const type = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const submit = async () => {
  await act(async () => void host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => void (await Promise.resolve()));
};

describe("MemoryQuotaBlock", () => {
  it("montre l'usage : faits, part relue à chaque message, écritures de DONNA aujourd'hui", async () => {
    await mount();
    const text = host.textContent ?? "";
    expect(text).toContain("50 / 200");
    expect(text).toContain("/ 400");
    expect(text).toMatch(/3\s%/); // 10 000 / 400 000 = 2,5 % arrondi
    expect(text).toContain(`2 / ${q.unlimited}`);
    expect(host.querySelectorAll('[role="progressbar"]')).toHaveLength(2);
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it("se relit quand DONNA vient d'écrire dans la mémoire (clé de rafraîchissement)", async () => {
    await mount();
    expect(host.textContent).toContain("50 / 200");
    state.project = project({ usage: { facts: 51, chars: 10_050, model_writes_today: 3 } });
    act(() => root.render(createElement(MemoryQuotaBlock, { labels, projectId: "p1", refreshKey: 1 })));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent).toContain("51 / 200");
    expect(host.textContent).toContain(`3 / ${q.unlimited}`);
  });

  it("alerte quand un plafond a été abaissé sous l'usage, sans rien promettre d'effacé", async () => {
    state.project = project({ limits: { ...project().limits, facts_max: level(200, null, 10, 10) }, usage: { facts: 50, chars: 100, model_writes_today: 0 } });
    await mount();
    expect(host.querySelector('[role="status"]')?.textContent).toBe(q.overUsage);
    expect(host.textContent).toContain("50 / 10");
  });

  it("n'offre aucun réglage à qui n'est ni propriétaire du projet ni responsable de l'espace", async () => {
    await mount();
    expect(button(q.edit)).toBeUndefined();
  });

  it("le propriétaire du projet règle les plafonds du projet, avec le maximum possible à côté", async () => {
    state.project = project({ can_set: true });
    await mount();
    await click(button(q.edit));
    const inputs = [...host.querySelectorAll("input")] as HTMLInputElement[];
    expect(inputs).toHaveLength(4); // un seul niveau : le projet
    expect(host.textContent).toContain(q.max.replace("{n}", "200"));
    await type(inputs[0], "80");
    await submit();

    const put = state.calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("/api/donna/chat/projects/p1/memory/quotas");
    expect(put.body).toEqual({ limits: { facts_max: 80, fact_chars_max: null, memory_prompt_chars_max: null, model_writes_per_day: null } });
    expect(host.querySelector("form")).toBeNull(); // formulaire refermé
    expect(host.textContent).toContain("50 / 80");
  });

  it("le responsable de l'espace règle aussi les plafonds de tous les projets, l'espace d'abord", async () => {
    state.project = project({ can_set: true });
    state.workspace = space();
    await mount();
    await click(button(q.edit));
    expect(host.querySelectorAll("input")).toHaveLength(8);
    await submit();
    const puts = state.calls.filter((c) => c.method === "PUT").map((c) => c.url);
    expect(puts).toEqual(["/api/donna/chat/workspace/quotas", "/api/donna/chat/projects/p1/memory/quotas"]);
  });

  it("n'envoie rien quand une saisie n'est pas un entier positif", async () => {
    state.project = project({ can_set: true });
    await mount();
    await click(button(q.edit));
    await type(host.querySelector("input") as HTMLInputElement, "beaucoup");
    await submit();
    expect(state.calls.some((c) => c.method === "PUT")).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(q.invalid);
  });

  it("garde le formulaire ouvert et le dit quand le serveur refuse", async () => {
    state.project = project({ can_set: true });
    state.reject = true;
    await mount();
    await click(button(q.edit));
    await type(host.querySelector("input") as HTMLInputElement, "500");
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(q.saveError);
    expect(host.querySelector("form")).not.toBeNull();
  });
});
