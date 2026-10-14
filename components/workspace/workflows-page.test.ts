// @vitest-environment jsdom
// Phase 3 frontend : run.error était un <p> isolé (pas le bandeau d'alerte utilisé ailleurs), et
// step.error partageait la MÊME couleur neutre que step.output — une étape en échec se confondait
// visuellement avec une sortie normale.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import type { WorkflowRunOut } from "@/lib/workspace-types";
import { RunRow } from "./workflows-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const run = (overrides: Partial<WorkflowRunOut>): WorkflowRunOut => ({
  id: "r1",
  status: "failed",
  trigger: "manual",
  error: null,
  started_at: new Date().toISOString(),
  finished_at: null,
  steps: [],
  ...overrides,
});

const mount = (r: WorkflowRunOut) => {
  act(() => {
    root.render(createElement(RunRow, { lang: "fr", labels: fr.workspace.workflows, run: r, defaultOpen: true }));
  });
};

describe("RunRow — erreur d'exécution", () => {
  it("l'erreur du run est dans un bandeau role=alert, pas un texte isolé", () => {
    mount(run({ error: "Le fournisseur a refusé la requête." }));
    const alert = host.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain("Le fournisseur a refusé la requête.");
  });

  it("l'erreur d'une étape est en rouge, pas dans la même couleur qu'une sortie normale", () => {
    mount(
      run({
        error: null,
        steps: [
          { position: 0, step_id: "ok", type: "agent", status: "succeeded", output: "Résultat normal", error: null },
          { position: 1, step_id: "ko", type: "agent", status: "failed", output: null, error: "Délai dépassé" },
        ],
      }),
    );
    const paragraphs = [...host.querySelectorAll("p")];
    const okParagraph = paragraphs.find((p) => p.textContent === "Résultat normal");
    const koParagraph = paragraphs.find((p) => p.textContent === "Délai dépassé");
    expect(okParagraph?.className).not.toContain("text-danger");
    expect(koParagraph?.className).toContain("text-danger");
  });
});
