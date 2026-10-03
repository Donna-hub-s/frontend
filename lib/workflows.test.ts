import { describe, expect, it } from "vitest";
import { briefingRequest, formatToolArguments, isFinished, isValidTime, latestRun, needsApproval, tally } from "./workflows";
import type { WorkflowRunOut } from "./workspace-types";

const run = (status: string, steps: string[] = []): WorkflowRunOut => ({
  id: "r", status, trigger: "manual", error: null, started_at: "2026-10-02T08:00:00", finished_at: null,
  steps: steps.map((s, i) => ({ position: i, step_id: `s${i}`, type: "notify", status: s, output: null, error: null })),
});

describe("needsApproval", () => {
  it("un brouillon, ou une définition modifiée depuis l'approbation, attend l'utilisateur", () => {
    expect(needsApproval({ status: "draft", approved: false })).toBe(true);
    expect(needsApproval({ status: "active", approved: false })).toBe(true); // modifiée après approbation
    expect(needsApproval({ status: "active", approved: true })).toBe(false);
    expect(needsApproval({ status: "paused", approved: true })).toBe(false);
  });
});

describe("runs", () => {
  it("un run « running » n'est pas terminé", () => {
    expect(isFinished(run("running"))).toBe(false);
    for (const status of ["succeeded", "failed", "skipped"]) expect(isFinished(run(status))).toBe(true);
  });

  it("le dernier run est le premier de la liste", () => {
    expect(latestRun(undefined)).toBeNull();
    expect(latestRun([])).toBeNull();
    expect(latestRun([run("failed"), run("succeeded")])?.status).toBe("failed");
  });

  it("décompte les étapes réussies, ignorées et en échec", () => {
    expect(tally(run("failed", ["succeeded", "succeeded", "skipped", "failed"]))).toEqual({ ok: 2, skipped: 1, failed: 1 });
    expect(tally(run("skipped"))).toEqual({ ok: 0, skipped: 0, failed: 0 });
  });
});

describe("briefing", () => {
  it("valide l'heure comme le serveur", () => {
    for (const ok of ["00:00", "08:30", "23:59"]) expect(isValidTime(ok)).toBe(true);
    for (const bad of ["24:00", "7:30", "08:60", "8h30", ""]) expect(isValidTime(bad)).toBe(false);
  });

  it("construit la requête du modèle « briefing du matin »", () => {
    expect(briefingRequest({ at: "07:30", timezone: "Europe/Paris", every: "weekdays", channels: ["app", "whatsapp"] })).toEqual({
      template: "morning_briefing", at: "07:30", timezone: "Europe/Paris", every: "weekdays", channels: ["app", "whatsapp"],
    });
  });
});

describe("formatToolArguments", () => {
  it("affiche le code avec de vrais retours à la ligne", () => {
    expect(formatToolArguments({ code: "import pandas\nprint(1)", documents: ["ventes.csv"] })).toBe('code:\nimport pandas\nprint(1)\ndocuments: ["ventes.csv"]');
  });

  it("garde les arguments simples sur une ligne chacun", () => {
    expect(formatToolArguments({ document: "ventes.csv", sheet: null })).toBe("document: ventes.csv\nsheet: null");
  });

  it("tolère les formes inattendues", () => {
    expect(formatToolArguments(undefined)).toBe("");
    expect(formatToolArguments("texte")).toBe("texte");
    expect(formatToolArguments([1, 2])).toBe("[1,2]");
    expect(formatToolArguments({})).toBe("");
  });
});
