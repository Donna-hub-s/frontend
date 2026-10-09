// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNow } from "./use-now";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

/** Deux listes qui suivent l'horloge : une seule horloge doit tourner pour les deux. */
function Probe({ active }: { active: boolean }) {
  const now = useNow(active);
  return createElement("span", { "data-now": now });
}

const render = (...actives: boolean[]) =>
  act(async () => {
    root.render(createElement("div", null, ...actives.map((active, index) => createElement(Probe, { key: index, active }))));
  });
const shown = () => [...host.querySelectorAll("span")].map((el) => Number(el.getAttribute("data-now")));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("useNow", () => {
  it("n'arme aucun intervalle tant que rien ne tourne", async () => {
    await render(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("avance d'une seconde à la fois tant que c'est actif", async () => {
    await render(true);
    const start = shown()[0];
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(shown()[0] - start).toBe(3_000);
  });

  it("partage une seule horloge entre plusieurs listes", async () => {
    await render(true, true, true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("s'arrête dès que la dernière liste a fini", async () => {
    await render(true, true);
    await render(true, false);
    expect(vi.getTimerCount()).toBe(1);
    await render(false, false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("repart de l'heure réelle quand l'horloge se rallume, pas de la dernière valeur connue", async () => {
    await render(true);
    await render(false);
    vi.setSystemTime(new Date("2026-10-09T10:30:00Z"));
    await render(true);
    expect(shown()[0]).toBe(new Date("2026-10-09T10:30:00Z").getTime());
  });
});
