// @vitest-environment jsdom
// Chemin d'annulation (« Stop ») du Composer — Phase 2 frontend : pas une couverture complète de
// conversation.tsx (1953 lignes, voir frontend/ameliorations.md §A6), juste le bouton qu'on vient
// d'étudier (workspace-provider.tsx::stop -> AbortController.abort() -> coupe le flux SSE).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import type { ChatMessage } from "@/lib/workspace-types";
import { Composer, StepsCard } from "./conversation";
import { WorkspaceProvider } from "./workspace-provider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

const mount = (busy: boolean) => {
  const onStop = vi.fn();
  const onSend = vi.fn().mockResolvedValue(undefined);
  act(() => {
    root.render(
      // WorkspaceProvider type `children` comme un champ requis (pas une signature avec enfants en
      // paramètres variadiques) : TS exige donc `children` dans les props elles-mêmes.
      // eslint-disable-next-line react/no-children-prop
      createElement(WorkspaceProvider, {
        initialConversations: [],
        initialPending: [],
        initialProjects: [],
        children: createElement(Composer, {
          lang: "fr",
          dict: fr.workspace,
          busy,
          conversationId: null,
          onSend,
          onStop,
          autoFocus: false,
        }),
      }),
    );
  });
  return { onStop, onSend };
};
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label);

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Composer — bouton Stop", () => {
  it("affiche Stop pendant la génération (busy) et jamais le bouton Envoyer", () => {
    mount(true);
    expect(button(fr.workspace.chat.stop)).toBeTruthy();
    expect(button(fr.workspace.chat.send)).toBeFalsy();
  });

  it("affiche Envoyer hors génération et jamais Stop", () => {
    mount(false);
    expect(button(fr.workspace.chat.send)).toBeTruthy();
    expect(button(fr.workspace.chat.stop)).toBeFalsy();
  });

  it("cliquer sur Stop appelle onStop (et jamais onSend)", () => {
    const { onStop, onSend } = mount(true);
    act(() => button(fr.workspace.chat.stop)!.click());
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });
});

// Phase 3 frontend : une étape d'outil terminée n'affichait qu'une coche, sans dire ce que l'outil
// avait trouvé — contrairement aux étapes de préparation (rag, mémoire…) qui montrent un résumé.
describe("StepsCard — aperçu du résultat d'une étape d'outil", () => {
  const baseMessage = (overrides: Partial<ChatMessage>): ChatMessage => ({
    id: "m1",
    role: "assistant",
    content: "",
    createdAt: Date.now(),
    attachments: [],
    steps: [],
    tools: [],
    status: "done",
    ...overrides,
  });
  const render = (message: ChatMessage) => {
    act(() => {
      root.render(createElement(StepsCard, { lang: "fr", dict: fr.workspace, message }));
    });
  };

  it("affiche un aperçu tronqué sous une étape d'outil terminée sans présentation dédiée", () => {
    const message = baseMessage({
      steps: [{ id: "s1", key: "search_documents", status: "done", at: Date.now() }],
      tools: [{ name: "search_documents", arguments: {}, result: "Le contrat prévoit un préavis de trois mois." }],
    });
    render(message);
    expect(host.textContent).toContain("Le contrat prévoit un préavis de trois mois.");
  });

  it("n'affiche aucun aperçu pour une proposition (déjà montrée par ActionCard)", () => {
    const message = baseMessage({
      steps: [{ id: "s1", key: "propose_email", status: "done", at: Date.now() }],
      tools: [{ name: "propose_email", arguments: {}, result: "identifiant-action-confidentiel" }],
    });
    render(message);
    expect(host.textContent).not.toContain("identifiant-action-confidentiel");
  });

  it("une étape de préparation garde son propre résumé, inchangé", () => {
    const message = baseMessage({
      steps: [{ id: "s1", key: "memory", status: "done", at: Date.now(), data: { kind: "memory", facts: 2 } }],
    });
    render(message);
    expect(host.textContent).toContain(fr.workspace.chat.memoryFacts.replace("{n}", "2"));
  });
});
