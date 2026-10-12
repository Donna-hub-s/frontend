// @vitest-environment jsdom
// Phase 4 frontend : 4 menus/overlays `role="dialog"` maison (model-menu, agent-menu,
// search-palette, link-card) n'avaient aucun piège de focus — Tab faisait sortir le clavier du
// menu ouvert vers la page derrière, contrairement au <dialog> natif partagé (dialog.tsx).
import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useFocusTrap } from "./use-focus-trap";

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

function Menu({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return createElement(
    "div",
    // eslint-disable-next-line react-hooks/refs -- simple relais de ref vers un <div>, pas une lecture pendant le rendu.
    { ref },
    createElement("button", { type: "button" }, "premier"),
    createElement("button", { type: "button" }, "second"),
    createElement("button", { type: "button" }, "dernier"),
  );
}

const tab = (shiftKey = false) => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, cancelable: true }));
const buttons = () => [...host.querySelectorAll("button")];

describe("useFocusTrap", () => {
  it("Tab depuis le dernier élément boucle vers le premier", () => {
    act(() => {
      root.render(createElement(Menu, { active: true }));
    });
    buttons()[2].focus();
    act(() => tab());
    expect(document.activeElement).toBe(buttons()[0]);
  });

  it("Shift+Tab depuis le premier élément boucle vers le dernier", () => {
    act(() => {
      root.render(createElement(Menu, { active: true }));
    });
    buttons()[0].focus();
    act(() => tab(true));
    expect(document.activeElement).toBe(buttons()[2]);
  });

  it("ne boucle pas quand active=false (menu fermé)", () => {
    act(() => {
      root.render(createElement(Menu, { active: false }));
    });
    buttons()[2].focus();
    act(() => tab());
    // Rien n'empêche le comportement natif : le focus ne revient pas de force au premier élément.
    expect(document.activeElement).toBe(buttons()[2]);
  });

  it("Tab au milieu de la liste ne fait rien (comportement natif normal)", () => {
    act(() => {
      root.render(createElement(Menu, { active: true }));
    });
    buttons()[0].focus();
    act(() => tab());
    // Pas de preventDefault pour un Tab "normal" : le focus reste où jsdom l'a laissé (il ne simule pas
    // la navigation Tab native), seul le cas de bouclage nous intéresse ici.
    expect(document.activeElement).toBe(buttons()[0]);
  });
});
