import { describe, expect, it } from "vitest";
import { crumbs, joinPath, justFinished, locationLabel, needsAttention, parentPath, type NasLink } from "./nas";

const link = (id: string, status: string): NasLink => ({
  id,
  project_id: "p1",
  root: "nas",
  path: "",
  auto_sync: true,
  status,
  last_sync_at: null,
  last_message: null,
  files_total: 0,
  files_indexed: 0,
  files_failed: 0,
  files_skipped: 0,
  created_at: "2026-10-14T10:00:00Z",
});

describe("chemins du NAS", () => {
  it("compose et remonte un chemin relatif", () => {
    expect(joinPath("", "Contrats")).toBe("Contrats");
    expect(joinPath("Contrats", "2025")).toBe("Contrats/2025");
    expect(parentPath("Contrats/2025")).toBe("Contrats");
    expect(parentPath("Contrats")).toBe("");
    expect(parentPath("")).toBe("");
  });

  it("construit le fil d'Ariane niveau par niveau", () => {
    expect(crumbs("")).toEqual([]);
    expect(crumbs("a/b/c")).toEqual([
      { name: "a", path: "a" },
      { name: "b", path: "a/b" },
      { name: "c", path: "a/b/c" },
    ]);
  });

  it("nomme l'emplacement", () => {
    expect(locationLabel("nas", "")).toBe("nas");
    expect(locationLabel("nas", "Contrats/2025")).toBe("nas / Contrats/2025");
  });
});

describe("suivi des synchronisations", () => {
  it("détecte une passe qui vient de se terminer", () => {
    expect(justFinished([link("a", "running")], [link("a", "done")])).toBe(true);
    expect(justFinished([link("a", "running")], [link("a", "running")])).toBe(false);
    expect(justFinished([link("a", "done")], [link("a", "done")])).toBe(false);
    // Un lien nouveau (absent avant) ou supprimé ne compte pas.
    expect(justFinished([], [link("a", "done")])).toBe(false);
    expect(justFinished([link("a", "running")], [])).toBe(false);
  });

  it("distingue les remarques qui sont des problèmes", () => {
    for (const status of ["unavailable", "review", "failed", "interrupted"]) expect(needsAttention(status)).toBe(true);
    for (const status of ["done", "running", "capacity_reached", "idle"]) expect(needsAttention(status)).toBe(false);
  });
});
