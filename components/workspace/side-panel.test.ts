// @vitest-environment jsdom
// Phase 3 frontend : PendingItem (panneau latéral/accueil) ne montrait qu'un résumé générique
// pour une recherche approfondie en attente, alors que ActionCard (fil de discussion) détaille
// déjà la profondeur et l'estimation de coût pour la MÊME proposition — même détail ici, sans
// suivi de progression (l'action quitte la liste dès qu'elle est décidée, voir decideAction).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import type { PendingActionOut } from "@/lib/workspace-types";
import { PendingItem, stepLabel } from "./side-panel";
import { WorkspaceProvider } from "./workspace-provider";

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

const mount = (action: PendingActionOut) => {
  act(() => {
    root.render(
      // eslint-disable-next-line react/no-children-prop -- children requis dans le type de WorkspaceProvider.
      createElement(WorkspaceProvider, {
        initialConversations: [],
        initialPending: [],
        initialProjects: [],
        children: createElement(PendingItem, { lang: "fr", dict: fr.workspace, action }),
      }),
    );
  });
};

describe("stepLabel — étiquettes d'outils ajoutées (Phase 3 frontend)", () => {
  it("search_documents et find_documents ont une étiquette propre, pas le repli générique", () => {
    expect(stepLabel(fr.workspace, "search_documents")).toBe(fr.workspace.tools.search_documents);
    expect(stepLabel(fr.workspace, "find_documents")).toBe(fr.workspace.tools.find_documents);
    expect(stepLabel(fr.workspace, "run_python")).toBe(fr.workspace.tools.run_python);
    expect(stepLabel(fr.workspace, "search_documents")).not.toBe(fr.workspace.tools.fallback);
  });

  it("un outil vraiment inconnu retombe toujours sur le repli générique", () => {
    expect(stepLabel(fr.workspace, "outil_qui_n_existe_pas")).toBe(fr.workspace.tools.fallback);
  });
});

describe("PendingItem — détail d'une recherche approfondie en attente", () => {
  it("affiche la profondeur et l'estimation de coût, comme ActionCard", () => {
    const action: PendingActionOut = {
      id: "a1",
      kind: "research",
      summary: "Recherche sur la TVA des services numériques",
      status: "awaiting",
      created_at: new Date().toISOString(),
      research: { question: "TVA services numériques ?", depth: "standard", lines: [], cost_usd: 0.12, cap_usd: 0.5, model: null },
    };
    mount(action);
    expect(host.textContent).toContain(fr.workspace.chat.researchDepth.standard);
    expect(host.textContent).toContain("0,50"); // plafond formaté
  });

  it("le bouton de validation dit « Lancer la recherche », pas « Valider »", () => {
    const action: PendingActionOut = {
      id: "a2",
      kind: "research",
      summary: "x",
      status: "awaiting",
      created_at: new Date().toISOString(),
      research: { question: "x", depth: "quick", lines: [], cost_usd: null, cap_usd: 0.5, model: null },
    };
    mount(action);
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).toContain(fr.workspace.chat.researchStart);
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).not.toContain(fr.workspace.panel.approve);
  });

  it("une proposition sans recherche garde le bouton générique « Valider »", () => {
    vi.stubGlobal("fetch", vi.fn());
    const action: PendingActionOut = {
      id: "a3",
      kind: "calendar_event",
      summary: "Point budget demain 14h",
      status: "awaiting",
      created_at: new Date().toISOString(),
    };
    mount(action);
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).toContain(fr.workspace.panel.approve);
    vi.unstubAllGlobals();
  });
});
