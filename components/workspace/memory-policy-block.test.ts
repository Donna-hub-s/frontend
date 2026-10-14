// @vitest-environment jsdom
// Qui peut modifier la mémoire d'un projet : le propriétaire règle, les autres lisent ; les choix plus souples que le plancher de l'espace ne sont pas
// offerts ; le responsable de l'espace règle le plancher. Le réseau est doublé par un faux serveur.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import { MemoryPolicyBlock } from "./memory-policy-block";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = fr.workspace.projects;
let host: HTMLElement;
let root: Root;
let server: { policy: { policy: string; floor: string; effective: string; can_set: boolean }; workspace: { floor: string; can_set: boolean }; calls: { method: string; url: string; body?: unknown }[]; reject: boolean };

const respond = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  server = { policy: { policy: "editors", floor: "editors", effective: "editors", can_set: true }, workspace: { floor: "editors", can_set: false }, calls: [], reject: false };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      server.calls.push({ method, url, body });
      if (method === "PUT" && server.reject) return respond({ detail: "non" }, 400);
      if (url.includes("/workspace/memory-policy")) {
        if (method === "PUT") {
          server.workspace.floor = body.policy;
          const order = ["editors", "approval", "owners"];
          if (order.indexOf(body.policy) > order.indexOf(server.policy.policy)) server.policy = { ...server.policy, floor: body.policy, effective: body.policy };
        }
        return respond(server.workspace);
      }
      if (method === "PUT") server.policy = { ...server.policy, policy: body.policy, effective: body.policy };
      return respond(server.policy);
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
    root.render(createElement(MemoryPolicyBlock, { labels, projectId: "p1" }));
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const selects = () => [...host.querySelectorAll("select")] as HTMLSelectElement[];
const change = async (select: HTMLSelectElement, value: string) => {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => void (await Promise.resolve()));
};

describe("MemoryPolicyBlock", () => {
  it("n'affiche rien tant que le serveur n'a pas répondu", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await mount();
    expect(host.innerHTML).toBe("");
  });

  it("un propriétaire règle la politique du projet", async () => {
    await mount();
    expect(host.textContent).toContain(labels.memoryPolicyTitle);
    const [select] = selects();
    expect(select.value).toBe("editors");
    await change(select, "approval");
    expect(server.calls.find((c) => c.method === "PUT")).toMatchObject({ url: "/api/donna/chat/projects/p1/memory/policy", body: { policy: "approval" } });
    expect(selects()[0].value).toBe("approval");
    expect(host.textContent).toContain(labels.memoryPolicyHint.approval);
  });

  it("un autre membre voit la valeur appliquée sans pouvoir la changer", async () => {
    server.policy = { policy: "owners", floor: "editors", effective: "owners", can_set: false };
    await mount();
    expect(selects()).toHaveLength(0);
    expect(host.textContent).toContain(labels.memoryPolicy.owners);
  });

  it("ne propose pas de choix plus souple que le plancher de l'espace, et dit pourquoi", async () => {
    server.policy = { policy: "editors", floor: "approval", effective: "approval", can_set: true };
    await mount();
    const options = [...selects()[0].options].map((o) => [o.value, o.disabled]);
    expect(options).toEqual([["editors", true], ["approval", false], ["owners", false]]);
    expect(host.textContent).toContain(labels.memoryPolicyFloorNote.replace("{policy}", labels.memoryPolicy.approval));
  });

  it("le responsable de l'espace règle le plancher, et la valeur appliquée est relue", async () => {
    server.workspace = { floor: "editors", can_set: true };
    await mount();
    const [, floor] = selects();
    expect(host.textContent).toContain(labels.memoryFloorTitle);
    await change(floor, "owners");
    expect(server.calls.find((c) => c.method === "PUT" && c.url.includes("/workspace/"))?.body).toEqual({ policy: "owners" });
    expect(host.textContent).toContain(labels.memoryPolicyFloorNote.replace("{policy}", labels.memoryPolicy.owners));
  });

  it("n'affiche pas le plancher à qui n'est pas responsable de l'espace", async () => {
    await mount();
    expect(selects()).toHaveLength(1);
    expect(host.textContent).not.toContain(labels.memoryFloorTitle);
  });

  it("dit quand le réglage a été refusé et garde l'ancienne valeur", async () => {
    server.reject = true;
    await mount();
    await change(selects()[0], "owners");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(labels.memoryPolicyError);
    expect(selects()[0].value).toBe("editors");
  });
});
