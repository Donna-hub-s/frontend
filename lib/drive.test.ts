import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadDriveFiles, driveTypeLabel, fileNameFromDisposition, formatSize, listDrive, runFirstThenParallel, type DriveFileOut } from "./drive";

describe("fileNameFromDisposition", () => {
  it("préfère filename* (UTF-8) au nom simple", () => {
    const header = `attachment; filename="Compte rendu ete.docx"; filename*=UTF-8''Compte%20rendu%20%C3%A9t%C3%A9.docx`;
    expect(fileNameFromDisposition(header, "x")).toBe("Compte rendu été.docx");
  });
  it("retombe sur le nom simple, puis sur le défaut", () => {
    expect(fileNameFromDisposition('inline; filename="plan.pdf"', "x")).toBe("plan.pdf");
    expect(fileNameFromDisposition(null, "id123")).toBe("id123");
    expect(fileNameFromDisposition("attachment", "id123")).toBe("id123");
  });
});

describe("runFirstThenParallel", () => {
  it("lance le premier SEUL puis les autres en parallèle borné, en gardant l'ordre", async () => {
    const started: number[] = [];
    let running = 0;
    let maxRunning = 0;
    let firstFinishedBeforeOthers = true;
    let firstDone = false;
    const results = await runFirstThenParallel(
      [0, 1, 2, 3, 4, 5],
      async (item) => {
        started.push(item);
        if (item > 0 && !firstDone) firstFinishedBeforeOthers = false;
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        if (item === 0) firstDone = true;
        return item * 10;
      },
      3,
    );
    expect(results).toEqual([0, 10, 20, 30, 40, 50]);
    expect(firstFinishedBeforeOthers).toBe(true);
    expect(maxRunning).toBe(3);
    expect(started[0]).toBe(0);
  });

  it("gère une liste vide et un seul élément, et rapporte la progression", async () => {
    expect(await runFirstThenParallel([], async () => 1)).toEqual([]);
    const progress: number[] = [];
    await runFirstThenParallel(["a"], async (x) => x, 3, (done) => progress.push(done));
    expect(progress).toEqual([1]);
  });
});

describe("Drive via fetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const file = (id: string, name: string): DriveFileOut => ({ id, name, mime_type: "application/pdf", is_folder: false, importable: true, modified_time: null, size: 1 });

  it("transforme une réponse non connectée en code d'erreur lisible par l'interface", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ detail: { code: "scope_missing", message: "x" } }), { status: 403 }));
    expect(await listDrive({})).toEqual({ ok: false, code: "scope_missing" });
    vi.mocked(fetch).mockResolvedValue(new Response("boom", { status: 409 }));
    expect(await listDrive({})).toEqual({ ok: false, code: "not_connected" });
    vi.mocked(fetch).mockRejectedValue(new Error("réseau"));
    expect(await listDrive({})).toEqual({ ok: false, code: "unavailable" });
  });

  it("une recherche ignore le dossier courant et passe la page demandée", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ files: [], next_page_token: null }), { status: 200 }));
    await listDrive({ query: " budget ", folderId: "abc", pageToken: "P2" });
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain("q=budget");
    expect(url).not.toContain("folder_id");
    expect(url).toContain("page_token=P2");
  });

  it("télécharge plusieurs fichiers sous leur nom d'export et rapporte les échecs sans tout annuler", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bad/")) return new Response(JSON.stringify({ detail: { code: "too_large" } }), { status: 413 });
      const name = url.includes("/doc1/") ? "Plan.docx" : "Notes.pdf";
      return new Response("contenu", { status: 200, headers: { "content-disposition": `attachment; filename="${name}"`, "content-type": "application/octet-stream" } });
    });
    const picked = [file("doc1", "Plan"), file("bad", "Gros"), file("pdf1", "Notes")];
    const progress: number[] = [];
    const result = await downloadDriveFiles(picked, (done) => progress.push(done));
    expect(result.files.map((f) => f.name)).toEqual(["Plan.docx", "Notes.pdf"]);
    expect(result.failed).toEqual([{ name: "Gros", code: "too_large" }]);
    expect(progress.at(-1)).toBe(3);
  });
});

describe("présentation", () => {
  it("étiquettes de format et tailles", () => {
    expect(driveTypeLabel({ mime_type: "application/vnd.google-apps.spreadsheet", is_folder: false })).toBe("Sheets");
    expect(driveTypeLabel({ mime_type: "image/png", is_folder: false })).toBe("IMG");
    expect(driveTypeLabel({ mime_type: "application/vnd.google-apps.folder", is_folder: true })).toBe("");
    expect(formatSize(512)).toBe("512 o");
    expect(formatSize(2048)).toBe("2 Ko");
    expect(formatSize(3 * 1_048_576)).toBe("3 Mo");
    expect(formatSize(null)).toBe("");
  });
});
