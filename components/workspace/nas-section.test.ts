// @vitest-environment jsdom
// Section « Dossiers du NAS » d'un projet : invisible tant que le serveur ne dit pas que le connecteur existe pour cet
// utilisateur, liste des dossiers liés et de leur état, choix d'un dossier, synchronisation, déliement, et rafraîchissement
// des documents quand une passe vient de finir. Le réseau est doublé par un faux serveur en mémoire.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import type { NasLink, NasStatus } from "@/lib/nas";
import { NasSection } from "./nas-section";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom n'implémente pas <dialog>.showModal() / close().
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

const labels = fr.workspace.projects;
const n = labels.nas;

const STATUS: NasStatus = { enabled: true, can_manage: true, roots: ["nas"], sync_interval_min: 30 };
const link = (over: Partial<NasLink> = {}): NasLink => ({
  id: "l1",
  project_id: "p1",
  root: "nas",
  path: "Contrats",
  auto_sync: true,
  status: "done",
  last_sync_at: "2026-10-14T10:00:00+00:00",
  last_message: null,
  files_total: 12,
  files_indexed: 10,
  files_failed: 1,
  files_skipped: 1,
  created_at: "2026-10-14T09:00:00+00:00",
  ...over,
});

type Server = {
  status: NasStatus;
  links: NasLink[];
  dirs: Record<string, string[]>;
  calls: { method: string; url: string; body?: unknown }[];
  createStatus: number;
};

let server: Server;
let host: HTMLElement;
let root: Root;

function respond(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  vi.useFakeTimers();
  server = { status: STATUS, links: [link()], dirs: { "": ["Contrats", "Factures"], Contrats: ["2025"] }, calls: [], createStatus: 202 };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      server.calls.push({ method, url, body });
      if (url.endsWith("/nas/status")) return respond(server.status);
      if (url.includes("/nas/browse")) {
        const path = new URL(url, "http://x").searchParams.get("path") ?? "";
        return respond({ root: "nas", path, directories: server.dirs[path] ?? [], truncated: false });
      }
      if (url.endsWith("/sync")) {
        server.links = server.links.map((l) => ({ ...l, status: "running" }));
        return respond(server.links[0], 202);
      }
      if (method === "POST" && url.endsWith("/nas")) {
        if (server.createStatus !== 202) return respond({ detail: "non" }, server.createStatus);
        const created = link({ id: "l2", path: body.path, auto_sync: body.auto_sync, status: "running", files_indexed: 0 });
        server.links = [...server.links, created];
        return respond(created, 202);
      }
      if (method === "PATCH") {
        server.links = server.links.map((l) => ({ ...l, auto_sync: body.auto_sync }));
        return respond(server.links[0]);
      }
      if (method === "DELETE") {
        server.links = [];
        return respond({ deleted: true, documents_removed: 3 });
      }
      if (url.endsWith("/nas")) return respond(server.links);
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
  vi.useRealTimers();
});

const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

async function mount(onSynced: () => void = () => {}, canEdit = true) {
  act(() => {
    root.render(createElement(NasSection, { lang: "fr", labels, projectId: "p1", canEdit, onSynced }));
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

describe("NasSection", () => {
  it("ne montre rien quand le connecteur n'existe pas pour cet utilisateur", async () => {
    server.status = { enabled: false, can_manage: false, roots: [], sync_interval_min: 0 };
    await mount();
    expect(host.innerHTML).toBe("");
    // Il ne va même pas lire les dossiers liés.
    expect(server.calls.some((c) => c.url.endsWith("/projects/p1/nas"))).toBe(false);
  });

  it("ne montre rien à qui ne peut pas lier quand rien n'est lié, mais montre ce qui l'est", async () => {
    server.status = { ...STATUS, can_manage: false };
    server.links = [];
    await mount();
    expect(host.innerHTML).toBe("");

    server.links = [link()];
    act(() => root.unmount());
    root = createRoot(host);
    await mount();
    expect(host.textContent).toContain("nas / Contrats");
    expect(button(n.link)).toBeUndefined(); // pas de « Lier un dossier »
  });

  it("affiche l'état, les chiffres et la dernière passe d'un dossier lié", async () => {
    server.links = [link({ last_message: "3 dossier(s) ou fichier(s) illisibles ou trop profonds : leur contenu n'est pas modifié.", status: "done" })];
    await mount();
    const text = host.textContent ?? "";
    expect(text).toContain("nas / Contrats");
    expect(text).toContain(n.status.done);
    expect(text).toContain("10 indexé(s) · 1 en échec · 1 ignoré(s)");
    expect(text).toContain("Dernière passe");
    expect(text).toContain("illisibles");
  });

  it("signale en couleur d'attention un NAS injoignable", async () => {
    server.links = [link({ status: "unavailable", last_message: "Dossier introuvable : le NAS est-il monté ?" })];
    await mount();
    const status = [...host.querySelectorAll("p")].find((p) => p.textContent === n.status.unavailable);
    expect(status?.className).toContain("text-attention");
  });

  it("« Synchroniser » lance une passe, bloque le bouton et rafraîchit les documents à la fin", async () => {
    const onSynced = vi.fn();
    await mount(onSynced);
    await click(button(n.sync));

    expect(server.calls.some((c) => c.method === "POST" && c.url.endsWith("/l1/sync"))).toBe(true);
    expect(button(n.sync)?.disabled).toBe(true);
    expect(host.textContent).toContain(n.status.running);
    expect(onSynced).not.toHaveBeenCalled();

    server.links = server.links.map((l) => ({ ...l, status: "done" }));
    await tick(2100); // le sondage relit les dossiers liés
    expect(onSynced).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(n.status.done);
    expect(button(n.sync)?.disabled).toBe(false);
  });

  it("relit lentement un dossier au repos : une synchronisation automatique finit par se voir", async () => {
    const onSynced = vi.fn();
    server.links = [link({ status: "running" })];
    await mount(onSynced);
    server.links = [link({ status: "done", files_indexed: 11 })];
    await tick(2100);
    expect(onSynced).toHaveBeenCalledTimes(1); // en cours → terminé
    expect(host.textContent).toContain("11 indexé(s)");

    const before = server.calls.length;
    await tick(5000);
    expect(server.calls.length).toBe(before); // au repos : pas de relecture toutes les 2 s
    await tick(30_000);
    expect(server.calls.length).toBeGreaterThan(before);
    expect(onSynced).toHaveBeenCalledTimes(1); // et sans fin de passe, pas de rafraîchissement inutile
  });

  it("règle la synchronisation automatique", async () => {
    await mount();
    const box = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(true);
    await click(box);
    const patch = server.calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ auto_sync: false });
    expect((host.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
  });

  it("annonce que la synchronisation automatique est coupée sur ce serveur", async () => {
    server.status = { ...STATUS, sync_interval_min: 0 };
    await mount();
    expect(host.textContent).toContain(n.autoSyncOff);
  });

  it("choisit un dossier en descendant l'arborescence puis le lie", async () => {
    await mount();
    await click(button(n.link));
    const dialog = host.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.textContent).toContain("Contrats");
    expect(dialog.textContent).toContain("Factures");

    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent === "Contrats"));
    expect(server.calls.some((c) => c.url.includes("/nas/browse") && c.url.includes("path=Contrats"))).toBe(true);
    expect(dialog.textContent).toContain("2025");
    expect(dialog.textContent).toContain("nas / Contrats");

    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent === "2025"));
    await click(button(n.chooseThis));

    const created = server.calls.find((c) => c.method === "POST" && c.url.endsWith("/projects/p1/nas"));
    expect(created?.body).toEqual({ root: "nas", path: "Contrats/2025", auto_sync: true });
    expect(host.textContent).toContain("nas / Contrats/2025");
    expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(false); // fenêtre refermée
  });

  it("le fil d'Ariane remonte d'un niveau", async () => {
    await mount();
    await click(button(n.link));
    const dialog = host.querySelector("dialog")!;
    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent === "Contrats"));
    const nav = dialog.querySelector("nav")!;
    await click([...nav.querySelectorAll("button")].find((b) => b.textContent === "nas"));
    expect(dialog.textContent).toContain("Factures");
  });

  it("garde la fenêtre ouverte et explique le refus d'un lien impossible", async () => {
    server.createStatus = 409;
    await mount();
    await click(button(n.link));
    await click(button(n.chooseThis));
    const dialog = host.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe(n.errors.link409);
  });

  it("délie en gardant les documents par défaut, ou en les retirant sur demande", async () => {
    const onSynced = vi.fn();
    await mount(onSynced);
    await click(host.querySelector(`button[title="${n.unlink}"]`) ?? undefined);
    expect(host.querySelector(`dialog[aria-label="${n.unlink}"]`)?.textContent).toContain("nas / Contrats");
    await click(button(n.unlinkKeep));
    const kept = server.calls.find((c) => c.method === "DELETE");
    expect(kept?.url).toContain("remove_documents=false");
    expect(onSynced).not.toHaveBeenCalled(); // les documents n'ont pas bougé
    expect(host.textContent).not.toContain("nas / Contrats");

    server.links = [link()];
    act(() => root.unmount());
    root = createRoot(host);
    await mount(onSynced);
    await click(host.querySelector(`button[title="${n.unlink}"]`) ?? undefined);
    await click(button(n.unlinkRemove));
    expect(server.calls.filter((c) => c.method === "DELETE").pop()?.url).toContain("remove_documents=true");
    expect(onSynced).toHaveBeenCalledTimes(1); // des documents sont partis : la liste est relue
  });

  it("un lecteur voit les dossiers liés sans pouvoir les modifier", async () => {
    await mount(() => {}, false);
    expect(host.textContent).toContain("nas / Contrats");
    expect(button(n.sync)).toBeUndefined();
    expect(host.querySelector(`button[title="${n.unlink}"]`)).toBeNull();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  });
});
