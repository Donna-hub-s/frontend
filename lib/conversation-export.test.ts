import { describe, expect, it } from "vitest";
import { EXPORT_FORMATS, exportHref } from "./conversation-export";

describe("exportHref", () => {
  it("construit l'adresse de chaque format, langue comprise", () => {
    expect(EXPORT_FORMATS).toEqual(["md", "pdf", "docx"]);
    expect(exportHref("c1", "pdf", "fr")).toBe("/api/donna/chat/c1/export?format=pdf&lang=fr");
    expect(exportHref("c1", "docx", "en")).toBe("/api/donna/chat/c1/export?format=docx&lang=en");
  });

  it("n'envoie que les langues connues et encode l'identifiant", () => {
    expect(exportHref("a/b?c", "md", "de")).toBe("/api/donna/chat/a%2Fb%3Fc/export?format=md&lang=fr");
  });
});

// ── Export avec les diagrammes dessinés par le navigateur ────────────────────────────────────────────────────────

import { filenameFromDisposition, prepareExport, exportDiagramsUrl, exportPostUrl, type ExportDeps } from "./conversation-export";
import { vi } from "vitest";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

function deps(over: Partial<ExportDeps> & { responses?: Response[] } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const queue = [...(over.responses ?? [])];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return queue.shift() ?? json({}, 500);
  });
  const value: ExportDeps = {
    render: over.render ?? (async (source) => `<svg>${source}</svg>`),
    rasterize: over.rasterize ?? (async (svg) => (svg.includes("BAD") ? null : btoa(svg))),
    fetch: fetchMock as unknown as typeof fetch,
  };
  return { value, calls };
}

describe("exportDiagramsUrl / exportPostUrl", () => {
  it("encodent l'identifiant", () => {
    expect(exportDiagramsUrl("a/b")).toBe("/api/donna/chat/a%2Fb/export/diagrams");
    expect(exportPostUrl("c1")).toBe("/api/donna/chat/c1/export");
  });
});

describe("filenameFromDisposition", () => {
  it("préfère filename* (UTF-8), puis filename", () => {
    expect(filenameFromDisposition(`attachment; filename="Audit-ventes.pdf"; filename*=UTF-8''Audit%20des%20ventes%20%C3%A9t%C3%A9.pdf`, "x.pdf")).toBe("Audit des ventes été.pdf");
    expect(filenameFromDisposition('attachment; filename="a.pdf"', "x.pdf")).toBe("a.pdf");
  });

  it("retombe sur le nom par défaut sans en-tête ou avec un encodage invalide", () => {
    expect(filenameFromDisposition(null, "x.pdf")).toBe("x.pdf");
    expect(filenameFromDisposition("attachment", "x.pdf")).toBe("x.pdf");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A; filename=\"ok.pdf\"", "x.pdf")).toBe("ok.pdf");
  });
});

describe("prepareExport", () => {
  it("laisse le Markdown au simple lien, sans rien demander", async () => {
    const { value, calls } = deps();
    expect(await prepareExport("c1", "md", "fr", value)).toEqual({ kind: "link" });
    expect(calls).toHaveLength(0);
  });

  it("n'a rien à dessiner : le lien suffit (aucun envoi)", async () => {
    const { value, calls } = deps({ responses: [json({ diagrams: [] })] });
    expect(await prepareExport("c1", "pdf", "fr", value)).toEqual({ kind: "link" });
    expect(calls.map((c) => c.url)).toEqual([exportDiagramsUrl("c1")]);
  });

  it("dessine chaque diagramme puis envoie les images, et rend le fichier avec son nom", async () => {
    const file = new Response("%PDF-1.7", { status: 200, headers: { "content-disposition": `attachment; filename="a.pdf"; filename*=UTF-8''Ventes%20%C3%A9t%C3%A9.pdf` } });
    const { value, calls } = deps({ responses: [json({ diagrams: [{ id: "a".repeat(16), source: "graph TD" }, { id: "b".repeat(16), source: "pie" }] }), file] });
    const outcome = await prepareExport("c1", "pdf", "en", value);
    expect(outcome.kind).toBe("file");
    if (outcome.kind === "file") expect(outcome.filename).toBe("Ventes été.pdf");
    expect(calls[1].url).toBe(exportPostUrl("c1"));
    expect(calls[1].init?.method).toBe("POST");
    const sent = JSON.parse(String(calls[1].init?.body));
    expect(sent.format).toBe("pdf");
    expect(sent.lang).toBe("en");
    expect(Object.keys(sent.diagrams)).toEqual(["a".repeat(16), "b".repeat(16)]);
  });

  it("omet un diagramme qui ne se dessine pas, sans faire échouer les autres", async () => {
    const { value, calls } = deps({
      responses: [json({ diagrams: [{ id: "a".repeat(16), source: "BAD" }, { id: "b".repeat(16), source: "pie" }] }), new Response("x")],
      render: async (source) => {
        if (source === "BAD") throw new Error("syntaxe");
        return `<svg>${source}</svg>`;
      },
    });
    await prepareExport("c1", "docx", "fr", value);
    expect(Object.keys(JSON.parse(String(calls[1].init?.body)).diagrams)).toEqual(["b".repeat(16)]);
  });

  it("revient au lien quand aucun diagramme n'a pu être dessiné", async () => {
    const { value, calls } = deps({ responses: [json({ diagrams: [{ id: "a".repeat(16), source: "BAD" }] })] });
    expect(await prepareExport("c1", "pdf", "fr", value)).toEqual({ kind: "link" });
    expect(calls).toHaveLength(1);
  });

  it("revient au lien quand la liste est illisible ou le réseau tombe, mais signale l'échec de l'envoi", async () => {
    expect(await prepareExport("c1", "pdf", "fr", deps({ responses: [json({}, 500)] }).value)).toEqual({ kind: "link" });
    const down: ExportDeps = { render: async () => "", rasterize: async () => null, fetch: (async () => { throw new Error("réseau"); }) as unknown as typeof fetch };
    expect(await prepareExport("c1", "pdf", "fr", down)).toEqual({ kind: "link" });
    const { value } = deps({ responses: [json({ diagrams: [{ id: "a".repeat(16), source: "pie" }] }), json({ detail: "non" }, 413)] });
    expect(await prepareExport("c1", "pdf", "fr", value)).toEqual({ kind: "error" });
  });
});

// ── Cible générique (document partagé) et enregistrement ─────────────────────────────────────────────────────────

import { prepareExportAt, saveExport } from "./conversation-export";

describe("prepareExportAt", () => {
  it("utilise les adresses de la cible, quelle qu'elle soit (conversation ou document partagé)", async () => {
    const { value, calls } = deps({ responses: [json({ diagrams: [{ id: "a".repeat(16), source: "pie" }] }), new Response("x")] });
    await prepareExportAt({ listUrl: "/liste", postUrl: "/envoi" }, "pdf", "fr", value);
    expect(calls.map((c) => c.url)).toEqual(["/liste", "/envoi"]);
  });
});

describe("saveExport", () => {
  it("télécharge le fichier reçu sous son nom, puis libère l'adresse temporaire", () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    const seen: { href: string; download: string }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      seen.push({ href: this.getAttribute("href") ?? "", download: this.download });
    });
    saveExport({ kind: "file", blob: new Blob(["x"]), filename: "Audit.pdf" }, "/lien");
    expect(seen).toEqual([{ href: "blob:fake", download: "Audit.pdf" }]);
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");

    saveExport({ kind: "link" }, "/lien");
    expect(seen[1]).toEqual({ href: "/lien", download: "" });
    click.mockRestore();
    vi.useRealTimers();
  });
});
