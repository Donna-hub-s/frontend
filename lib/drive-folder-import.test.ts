import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelDriveFolderImportRun,
  driveFolderImportCancelUrl,
  driveFolderImportRunUrl,
  fetchDriveFolderImportRun,
  isFinished,
  startDriveFolderImport,
  visibleSteps,
  type DriveFolderImportRun,
  type DriveFolderImportStep,
} from "./drive-folder-import";

describe("drive-folder-import helper functions", () => {
  it("isFinished returns false only for running status", () => {
    expect(isFinished("running")).toBe(false);
    expect(isFinished("done")).toBe(true);
    expect(isFinished("failed")).toBe(true);
    expect(isFinished("cancelled")).toBe(true);
    expect(isFinished("interrupted")).toBe(true);
  });

  it("builds correct run and cancel URLs", () => {
    expect(driveFolderImportRunUrl("proj1", "runA")).toBe(
      "/api/donna/chat/projects/proj1/documents/drive/folder/runA"
    );
    expect(driveFolderImportCancelUrl("proj1", "runA")).toBe(
      "/api/donna/chat/projects/proj1/documents/drive/folder/runA/cancel"
    );
  });

  it("filters consecutive duplicate step labels in visibleSteps", () => {
    const steps: DriveFolderImportStep[] = [
      { at: "1", kind: "listed", label: "Found 10 files" },
      { at: "2", kind: "imported", label: "Imported file 1" },
      { at: "3", kind: "imported", label: "Imported file 1" }, // duplicate
      { at: "4", kind: "imported", label: "Imported file 2" },
      { at: "5", kind: "done", label: "Finished" },
    ];

    const visible = visibleSteps(steps, 10);
    expect(visible).toHaveLength(4);
    expect(visible.map((s) => s.label)).toEqual([
      "Found 10 files",
      "Imported file 1",
      "Imported file 2",
      "Finished",
    ]);
  });

  it("limits visibleSteps count to max parameter", () => {
    const steps: DriveFolderImportStep[] = Array.from({ length: 10 }, (_, i) => ({
      at: String(i),
      kind: "imported",
      label: `Step ${i}`,
    }));

    expect(visibleSteps(steps, 3)).toHaveLength(3);
    expect(visibleSteps(steps, 3).map((s) => s.label)).toEqual([
      "Step 7",
      "Step 8",
      "Step 9",
    ]);
  });
});

describe("drive-folder-import API functions", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("startDriveFolderImport sends POST and returns JSON on success", async () => {
    const mockRun: Partial<DriveFolderImportRun> = {
      id: "run1",
      project_id: "p1",
      folder_id: "f1",
      status: "running",
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    });

    const result = await startDriveFolderImport("p1", "f1", "My Folder");
    expect(result).toEqual(mockRun);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/donna/chat/projects/p1/documents/drive/folder",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ folder_id: "f1", folder_name: "My Folder" }),
      })
    );
  });

  it("startDriveFolderImport returns null on error response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const result = await startDriveFolderImport("p1", "f1", null);
    expect(result).toBeNull();
  });

  it("fetchDriveFolderImportRun fetches run data", async () => {
    const mockRun: Partial<DriveFolderImportRun> = { id: "run1", status: "done" };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRun,
    });

    const result = await fetchDriveFolderImportRun("p1", "run1");
    expect(result).toEqual(mockRun);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/donna/chat/projects/p1/documents/drive/folder/run1",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("cancelDriveFolderImportRun posts to cancel endpoint", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    const ok = await cancelDriveFolderImportRun("p1", "run1");
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/donna/chat/projects/p1/documents/drive/folder/run1/cancel",
      expect.objectContaining({ method: "POST" })
    );
  });
});
