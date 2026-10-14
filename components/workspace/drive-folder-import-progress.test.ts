// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import * as driveFolderImportLib from "@/lib/drive-folder-import";
import { DriveFolderImportProgress } from "./drive-folder-import-progress";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

const initialRun: driveFolderImportLib.DriveFolderImportRun = {
  id: "run_drive_1",
  project_id: "proj_1",
  status: "running",
  folder_id: "folder_123",
  folder_name: "Dossier Test",
  files_found: 10,
  files_imported: 4,
  files_failed: 0,
  files_skipped: 0,
  steps: [{ at: "2025-01-01T00:00:00Z", kind: "importing", label: "Import en cours..." }],
  created_at: "2025-01-01T00:00:00Z",
  finished_at: null,
  error: null,
};

async function mount(props: Partial<Parameters<typeof DriveFolderImportProgress>[0]> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(DriveFolderImportProgress, {
        projectId: "proj_1",
        run: initialRun,
        labels: fr.workspace.projects.driveFolderImport,
        ...props,
      })
    );
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("DriveFolderImportProgress", () => {
  it("affiche l'état en cours avec role='status' et aria-live='polite'", async () => {
    vi.spyOn(driveFolderImportLib, "fetchDriveFolderImportRun").mockImplementation(() => new Promise(() => {}));
    await mount();

    const statusEl = host.querySelector("[role='status']");
    expect(statusEl).not.toBeNull();
    expect(statusEl?.getAttribute("aria-live")).toBe("polite");
    expect(host.textContent).toContain("Dossier Test");
    expect(host.textContent).toContain("Import en cours...");
  });

  it("met à jour l'état quand l'import termine", async () => {
    const onFinished = vi.fn();
    vi.spyOn(driveFolderImportLib, "fetchDriveFolderImportRun").mockResolvedValue({
      ...initialRun,
      status: "done",
      files_imported: 10,
      finished_at: "2025-01-01T00:01:00Z",
    });

    await mount({ onFinished });

    const statusEl = host.querySelector("[role='status']");
    expect(statusEl).not.toBeNull();
    expect(statusEl?.getAttribute("aria-live")).toBe("polite");
    expect(onFinished).toHaveBeenCalledOnce();
  });

  it("gère l'action de masquer via onDismiss", async () => {
    const onDismiss = vi.fn();
    const completedRun: driveFolderImportLib.DriveFolderImportRun = {
      ...initialRun,
      status: "done",
      files_imported: 10,
    };

    await mount({ run: completedRun, onDismiss });

    const dismissButton = host.querySelector("button");
    expect(dismissButton?.textContent?.trim()).toBe(fr.workspace.projects.driveFolderImport.dismiss);

    await act(async () => {
      dismissButton?.click();
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
