// @vitest-environment jsdom
// Menu d'export du document partagé : Markdown reste un simple lien ; PDF et Word dessinent d'abord les diagrammes Mermaid du document (le
// navigateur est seul à savoir le faire), les envoient, et enregistrent le fichier reçu. Sans diagramme — ou si le dessin échoue — c'est le
// lien d'export habituel, comme avant. Le moteur Mermaid et le réseau sont doublés.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import { canvasUrls } from "@/lib/canvas";
import { ExportMenu } from "./canvas-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Jamais le vrai moteur ni le vrai canevas ici : seul le branchement est testé.
const rasterize = vi.fn(async (svg: string) => (svg.includes("BAD") ? null : "UE5H"));
vi.mock("./export-deps", () => ({
  browserExportDeps: () => ({ render: async (source: string) => `<svg>${source}</svg>`, rasterize: (svg: string) => rasterize(svg) }),
}));

const labels = fr.workspace.canvas;
const ID = "canvas-1";
const KEY = "a".repeat(16);

type Call = { url: string; method: string; body?: unknown };
let calls: Call[];
let diagrams: { id: string; source: string }[];
let postStatus: number;
let host: HTMLElement;
let root: Root;
let clicked: { href: string; download: string }[];

beforeEach(() => {
  calls = [];
  diagrams = [{ id: KEY, source: "graph TD\nA-->B" }];
  postStatus = 200;
  clicked = [];
  rasterize.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/export/diagrams")) return new Response(JSON.stringify({ diagrams }), { status: 200 });
      return postStatus === 200
        ? new Response("%PDF-1.7", { status: 200, headers: { "content-disposition": `attachment; filename*=UTF-8''Sch%C3%A9ma.pdf` } })
        : new Response("{}", { status: postStatus });
    }),
  );
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.getAttribute("href") ?? "", download: this.download });
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

async function openMenu() {
  act(() => {
    root.render(createElement(ExportMenu, { id: ID, labels, lang: "fr" }));
  });
  await act(async () => (host.querySelector(`button[aria-label="${labels.export}"]`) as HTMLButtonElement).click());
}

const item = (name: string) => [...host.querySelectorAll('a[role="menuitem"]')].find((a) => a.textContent === name) as HTMLAnchorElement;

async function choose(name: string) {
  const link = item(name);
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => void link.dispatchEvent(event));
  await settle();
  await settle();
  return event;
}

describe("ExportMenu du document partagé", () => {
  it("laisse le Markdown au simple lien : aucun appel, le clic n'est pas détourné", async () => {
    await openMenu();
    // jsdom ne navigue pas : on relève l'état du clic APRÈS les gestionnaires de l'application, puis on l'annule pour éviter son avertissement.
    let prevented: boolean | null = null;
    document.addEventListener("click", (event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
    await choose(labels.exportMd);
    expect(prevented).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("PDF avec diagramme : dessine, envoie les images à l'adresse du document, enregistre le fichier reçu", async () => {
    await openMenu();
    const event = await choose(labels.exportPdf);
    expect(event.defaultPrevented).toBe(true); // c'est le script qui télécharge
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${canvasUrls.exportDiagrams(ID)}`, `POST ${canvasUrls.exportPost(ID)}`]);
    expect(calls[1].body).toEqual({ format: "pdf", lang: "fr", diagrams: { [KEY]: "UE5H" } });
    expect(clicked).toEqual([{ href: "blob:fake", download: "Schéma.pdf" }]);
    expect(host.querySelector('[role="menu"]')).toBeNull(); // le menu se referme
  });

  it("Word suit le même chemin", async () => {
    await openMenu();
    await choose(labels.exportDocx);
    expect((calls[1].body as { format: string }).format).toBe("docx");
  });

  it("sans diagramme : le lien d'export habituel, rien n'est envoyé", async () => {
    diagrams = [];
    await openMenu();
    await choose(labels.exportPdf);
    expect(calls).toHaveLength(1);
    expect(clicked).toEqual([{ href: canvasUrls.export(ID, "pdf"), download: "" }]);
  });

  it("un diagramme qui ne se dessine pas est omis ; si aucun ne se dessine, retour au lien", async () => {
    diagrams = [{ id: KEY, source: "BAD" }];
    await openMenu();
    await choose(labels.exportPdf);
    expect(calls).toHaveLength(1);
    expect(clicked[0].href).toBe(canvasUrls.export(ID, "pdf"));
  });

  it("dit que l'export a échoué (et reste ouvert) quand le serveur refuse l'envoi", async () => {
    postStatus = 413;
    await openMenu();
    await choose(labels.exportPdf);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(labels.exportFailed);
    expect(clicked).toHaveLength(0);
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
  });
});
