// @vitest-environment jsdom
// Phase 4 frontend : WorkflowStepList remplace deux copies identiques du même <ol> numéroté
// (workflow-draft.tsx et workflows-page.tsx) — un seul rendu, utilisé aux deux endroits.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkflowStepList } from "./workflow-agents";

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

describe("WorkflowStepList", () => {
  it("numérote chaque étape dans l'ordre reçu", () => {
    act(() => {
      root.render(createElement(WorkflowStepList, { steps: ["Chercher les factures", "Rédiger le résumé"] }));
    });
    expect([...host.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Chercher les factures", "Rédiger le résumé"]);
    expect(host.querySelector("ol")?.className).toContain("mt-2"); // marge par défaut
  });

  it("ne rend rien quand il n'y a aucune étape (pas un <ol> vide)", () => {
    act(() => {
      root.render(createElement(WorkflowStepList, { steps: [] }));
    });
    expect(host.querySelector("ol")).toBeNull();
  });

  it("accepte une marge différente (workflows-page.tsx utilise mt-3, workflow-draft.tsx mt-2)", () => {
    act(() => {
      root.render(createElement(WorkflowStepList, { steps: ["x"], className: "mt-3" }));
    });
    expect(host.querySelector("ol")?.className).toContain("mt-3");
  });
});
