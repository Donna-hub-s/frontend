// @vitest-environment jsdom
// Chemin d'annulation (« Stop ») du Composer — Phase 2 frontend : pas une couverture complète de
// conversation.tsx (1953 lignes, voir frontend/ameliorations.md §A6), juste le bouton qu'on vient
// d'étudier (workspace-provider.tsx::stop -> AbortController.abort() -> coupe le flux SSE).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import { Composer } from "./conversation";
import { WorkspaceProvider } from "./workspace-provider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

const mount = (busy: boolean) => {
  const onStop = vi.fn();
  const onSend = vi.fn().mockResolvedValue(undefined);
  act(() => {
    root.render(
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
