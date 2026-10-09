// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import { HomeShortcuts } from "./home-screen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

const mount = (props: Partial<Parameters<typeof HomeShortcuts>[0]> = {}) => {
  const handlers = { onAttach: vi.fn(), onWebSearch: vi.fn(), onVoice: vi.fn() };
  act(() => {
    root.render(createElement(HomeShortcuts, { labels: fr.workspace.chat, voiceLabel: fr.workspace.voice.start, ...handlers, ...props }));
  });
  return handlers;
};
const buttons = () => [...host.querySelectorAll("button")];

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("HomeShortcuts", () => {
  it("propose trois gestes réels, nommés comme les boutons de la barre", () => {
    mount();
    expect(buttons().map((b) => b.textContent)).toEqual(["Joindre un document", "Rechercher sur le Web", "Mode vocal"]);
  });

  it("chaque geste appelle son action — aucun n'écrit dans la saisie", () => {
    const { onAttach, onWebSearch, onVoice } = mount();
    act(() => buttons()[0].click());
    act(() => buttons()[1].click());
    act(() => buttons()[2].click());
    expect([onAttach, onWebSearch, onVoice].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it("n'affiche pas le mode vocal quand la barre n'a pas de voix", () => {
    mount({ onVoice: undefined });
    expect(buttons().map((b) => b.textContent)).toEqual(["Joindre un document", "Rechercher sur le Web"]);
  });
});
