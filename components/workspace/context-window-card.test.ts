// @vitest-environment jsdom
// Fenêtre de contexte d'un projet : résumé dans la colonne latérale (barre + total), détail dans une fenêtre (rubriques, outils actifs/non offerts avec
// la raison, outils MCP hors de la fenêtre de DONNA, extraits RAG variables, consigne système et guide des outils montrés par leur poids seul), choix du
// modèle / de la conversation / de l'agent qui relancent la lecture. Le réseau est doublé par un faux serveur en mémoire.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import type { ContextBreakdown, ContextItem, ContextSection } from "@/lib/context-window";
import type { ConversationOut } from "@/lib/workspace-types";
import { ContextWindowCard } from "./context-window-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom n'implémente pas <dialog>.showModal() / close().
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

const labels = fr.workspace.projects;
const c = labels.contextWindow;

const item = (over: Partial<ContextItem> & { id: string }): ContextItem => ({ label: over.id, tokens: 10, chars: 40, active: true, note: null, text: null, ...over });
const section = (over: Partial<ContextSection> & { id: string }): ContextSection => ({
  label: over.id,
  kind: "system",
  tokens: 0,
  potential_tokens: 0,
  chars: 0,
  counted: true,
  variable: false,
  items: [],
  note: null,
  text: null,
  truncated: false,
  ...over,
});

function breakdown(url: string): ContextBreakdown {
  const params = new URL(url, "http://x").searchParams;
  const model = params.get("model");
  return {
    project_id: "p1",
    conversation_id: params.get("conversation_id"),
    agent: params.get("agent_id") ? "Relecteur" : null,
    model: model ? { id: model, label: "GPT Test", context: 100_000 } : null,
    window: model ? 100_000 : null,
    used_tokens: 4_000,
    percent: model ? 4 : null,
    estimator: "chars/4",
    sections: [
      section({ id: "system_prompt", kind: "system", tokens: 500, note: "Posée par l'opérateur du serveur." }),
      section({
        id: "tools",
        kind: "tools",
        tokens: 2_500,
        potential_tokens: 700,
        items: [
          item({ id: "search_documents", label: "search_documents", tokens: 300 }),
          item({ id: "canvas_write", label: "canvas_write", tokens: 700, active: false, note: "compétence « Document partagé » désactivée" }),
        ],
      }),
      section({
        id: "mcp",
        kind: "mcp",
        tokens: 0,
        potential_tokens: 900,
        counted: false,
        note: "Ces outils ne sont PAS dans la fenêtre de DONNA.",
        items: [item({ id: "redacteur:word_create", label: "redacteur · word_create", tokens: 450 }), item({ id: "analyste:xl_read", label: "analyste · xl_read", tokens: 450 })],
      }),
      section({
        id: "project_memory",
        kind: "memory",
        tokens: 600,
        text: "Mémoire PARTAGÉE du projet",
        items: [item({ id: "f1", label: "Le client clôture au 31 mars", tokens: 12, text: "- [f1] Le client clôture au 31 mars" })],
      }),
      section({ id: "rag", kind: "rag", tokens: 0, potential_tokens: 5_000, counted: false, variable: true, note: "Dépend de la question." }),
    ],
  };
}

type Server = { calls: string[]; contextStatus: number; models: unknown };
let server: Server;
let host: HTMLElement;
let root: Root;

const respond = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }));

const MODELS = {
  models: [
    { id: "gpt-test", tier: "eco", label: "GPT Test", provider: "p", model: "m", price_in: null, price_out: null, context: 100_000, reasoning: false, vision: false, recommended: false },
    { id: "no-window", tier: "eco", label: "Sans fenêtre", provider: "p", model: "m2", price_in: null, price_out: null, context: null, reasoning: false, vision: false, recommended: false },
  ],
  efforts: [],
  default_provider: "p",
};

const conversations: ConversationOut[] = [
  { id: "c1", title: "Clôture 2025", created_at: "2026-10-01T10:00:00Z", project_id: "p1" },
  { id: "c2", title: "Audit fournisseurs", created_at: "2026-10-02T10:00:00Z", project_id: "p1" },
];

beforeEach(() => {
  server = { calls: [], contextStatus: 200, models: MODELS };
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/projects/p1/context")) {
        server.calls.push(url);
        return server.contextStatus === 200 ? respond(breakdown(url)) : respond({ detail: "non" }, server.contextStatus);
      }
      if (url.endsWith("/chat/models")) return respond(server.models);
      if (url.includes("/projects/p1/agents")) return respond([{ id: "ag1", name: "Relecteur", archived: false }]);
      return respond({}, 404);
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

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

async function mount(refreshKey: string | number = 0) {
  act(() => {
    root.render(createElement(ContextWindowCard, { lang: "fr", labels, projectId: "p1", conversations, refreshKey }));
  });
  await settle();
  await settle();
}

const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
const click = async (el: Element | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => void el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await settle();
};
const change = async (select: HTMLSelectElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    setter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
};
const selectLabelled = (text: string) => [...host.querySelectorAll("label")].find((l) => l.textContent?.startsWith(text))!.querySelector("select") as HTMLSelectElement;
const row = (id: string) => host.querySelector(`[data-section="${id}"]`) as HTMLElement;

describe("ContextWindowCard — résumé", () => {
  it("montre le total et la barre, sans pourcentage tant qu'aucun modèle n'est choisi", async () => {
    await mount();
    expect(host.textContent).toMatch(/4[\s\u202f\u00a0]?000 jetons/);
    expect(host.textContent).toContain(c.noWindow);
    expect(host.querySelector('[role="img"]')).toBeTruthy();
    // Seules les rubriques qui pèsent vraiment dans la fenêtre font un segment : ni MCP ni RAG.
    expect([...host.querySelectorAll("[data-segment]")].map((el) => el.getAttribute("data-segment"))).toEqual(["system_prompt", "tools", "project_memory"]);
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]).not.toContain("model=");
  });

  it("prend le modèle choisi dans le composeur quand il annonce une fenêtre, et donne la part qu'on y occupe", async () => {
    window.localStorage.setItem("donna.model-choice", JSON.stringify({ id: "gpt-test", effort: null }));
    await mount();
    expect(server.calls.at(-1)).toContain("model=gpt-test");
    expect(host.textContent).toContain("4 % de la fenêtre de GPT Test");
  });

  it("dit que le détail n'a pas pu être lu au lieu de rester vide", async () => {
    server.contextStatus = 404;
    await mount();
    expect(host.textContent).toContain(c.error);
    expect(host.querySelector('[role="img"]')).toBeNull();
  });

  it("relit quand ce qui compose le contexte change (clé de rafraîchissement)", async () => {
    await mount("0:a");
    const before = server.calls.length;
    await mount("1:a");
    expect(server.calls.length).toBe(before + 1);
  });
});

describe("ContextWindowCard — détail", () => {
  async function openDetails() {
    await mount();
    await click(button(c.details));
    return document.querySelector("dialog")!;
  }

  it("liste chaque rubrique avec son nom du dictionnaire et son poids", async () => {
    await openDetails();
    const names = fr.workspace.projects.contextWindow.sections;
    for (const id of ["system_prompt", "tools", "mcp", "project_memory", "rag"] as const) expect(row(id).textContent).toContain(names[id]);
    expect(row("tools").textContent).toContain("2");
    expect(host.textContent).toContain(c.estimate);
  });

  it("montre les outils actifs puis, repliés, ceux qui ne sont pas offerts avec la raison et ce qu'ils pèseraient", async () => {
    await openDetails();
    const tools = row("tools");
    expect(tools.textContent).toContain("search_documents");
    const skipped = [...tools.querySelectorAll("details")].find((d) => d.textContent?.includes("Non chargés (1)"))!;
    expect(skipped.textContent).toContain("canvas_write");
    expect(skipped.textContent).toContain("compétence « Document partagé » désactivée");
    expect(skipped.textContent).toContain("700");
  });

  it("marque les outils MCP comme hors de la fenêtre de DONNA, groupés par sous-agent, sans part de la fenêtre", async () => {
    await openDetails();
    const mcp = row("mcp");
    expect(mcp.textContent).toContain(c.outside);
    expect(mcp.textContent).toContain("redacteur");
    expect(mcp.textContent).toContain("analyste");
    expect(mcp.textContent).toContain("word_create");
    expect(mcp.textContent).not.toContain("%");
  });

  it("présente les extraits RAG comme un plafond variable, jamais comme une charge", async () => {
    await openDetails();
    const rag = row("rag");
    expect(rag.textContent).toContain(c.variable);
    expect(rag.textContent).toMatch(/jusqu'à\s5/);
    expect(rag.textContent).not.toContain("%");
  });

  it("montre la consigne système par son poids seul, jamais son texte", async () => {
    await openDetails();
    const prompt = row("system_prompt");
    expect(prompt.textContent).toContain(fr.workspace.projects.contextWindow.sections.system_prompt);
    expect(prompt.textContent).toContain("500");
    expect(prompt.querySelector("pre")).toBeNull();
  });

  it("montre le texte d'un fait de la mémoire en texte brut (jamais interprété)", async () => {
    await openDetails();
    const memory = row("project_memory");
    expect(memory.textContent).toContain("Le client clôture au 31 mars");
    expect(memory.querySelector("pre")?.textContent).toContain("Mémoire PARTAGÉE du projet");
  });
});

describe("ContextWindowCard — choix", () => {
  it("ne propose que les modèles qui annoncent une fenêtre, et relit avec celui qu'on choisit", async () => {
    await mount();
    await click(button(c.details));
    const select = selectLabelled(c.model);
    expect([...select.options].map((o) => o.textContent)).toEqual([c.noModel, "GPT Test"]);

    await change(select, "gpt-test");

    expect(server.calls.at(-1)).toContain("model=gpt-test");
    expect(host.textContent).toContain("4 % de la fenêtre de GPT Test");
    expect(host.textContent).toContain(`${c.free} : 96`);
  });

  it("relit avec la conversation choisie, puis l'agent", async () => {
    await mount();
    await click(button(c.details));

    await change(selectLabelled(c.conversation), "c2");
    expect(server.calls.at(-1)).toContain("conversation_id=c2");

    await change(selectLabelled(c.agent), "ag1");
    expect(server.calls.at(-1)).toContain("conversation_id=c2");
    expect(server.calls.at(-1)).toContain("agent_id=ag1");

    await change(selectLabelled(c.conversation), "");
    expect(server.calls.at(-1)).not.toContain("conversation_id");
  });

  it("garde le modèle du composeur intact : le choix fait ici est une loupe, pas un réglage", async () => {
    window.localStorage.setItem("donna.model-choice", JSON.stringify({ id: "gpt-test", effort: null }));
    await mount();
    await click(button(c.details));
    await change(selectLabelled(c.model), "");
    expect(window.localStorage.getItem("donna.model-choice")).toBe(JSON.stringify({ id: "gpt-test", effort: null }));
    expect(server.calls.at(-1)).not.toContain("model=");
  });
});
