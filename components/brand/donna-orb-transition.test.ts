// @vitest-environment jsdom
// Changement d'état de l'orbe : fondu enchaîné (le nouveau dessin par-dessus l'ancien) au lieu d'un remplacement net.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DonnaOrb, ORB_SWITCH_MS, type OrbState } from "./donna-orb";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

const show = (state: OrbState) =>
  act(async () => {
    root.render(createElement(DonnaOrb, { state }));
  });
const layers = () => [...host.querySelectorAll<SVGGElement>("[data-layer]")];
const states = () => layers().map((layer) => layer.dataset.layer);
const wait = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("orbe — changement d'état", () => {
  it("à l'affichage initial : un seul dessin, sans fondu (rien à remplacer)", async () => {
    await show("idle");
    expect(states()).toEqual(["idle"]);
    expect(layers()[0].classList.contains("orb-layer-in")).toBe(false);
  });

  it("garde l'ancien dessin dessous et monte le nouveau par-dessus, qui fond", async () => {
    await show("idle");
    await show("thinking");
    expect(states()).toEqual(["idle", "thinking"]); // l'ordre du DOM est l'ordre de superposition
    expect(layers()[1].classList.contains("orb-layer-in")).toBe(true);
    expect(layers()[0].classList.contains("orb-layer-in")).toBe(false); // l'ancien reste opaque : sinon le disque clignote
  });

  it("l'ancien dessin garde son élément : son animation ne repart pas de zéro au moment de s'effacer", async () => {
    await show("idle");
    const before = layers()[0];
    await show("thinking");
    expect(layers()[0]).toBe(before);
  });

  it("retire l'ancien dessin après le fondu, et le nouveau ne porte plus de classe de fondu", async () => {
    await show("idle");
    await show("working");
    await wait(ORB_SWITCH_MS - 1);
    expect(states()).toEqual(["idle", "working"]);
    await wait(1);
    expect(states()).toEqual(["working"]);
    expect(layers()[0].classList.contains("orb-layer-in")).toBe(false);
  });

  it("ne refait rien quand l'état ne change pas", async () => {
    await show("answering");
    await show("answering");
    await show("answering");
    expect(states()).toEqual(["answering"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("seul le halo de l'ancien état s'éteint (il dépasse du disque, que le nouveau disque ne recouvre pas)", async () => {
    await show("answering"); // seul état avec un halo
    await show("idle");
    const [outgoing, incoming] = layers();
    expect(outgoing.querySelectorAll(".orb-halo-out")).toHaveLength(1);
    expect(incoming.querySelectorAll(".orb-halo-out")).toHaveLength(0);
  });

  it("le halo du nouvel état apparaît avec sa couche, sans s'éteindre", async () => {
    await show("idle");
    await show("answering");
    expect(host.querySelectorAll(".orb-halo-out")).toHaveLength(0);
    expect(layers()[1].querySelectorAll(".orb-halo")).toHaveLength(1);
  });

  it("deux dessins superposés n'ont jamais d'identifiant SVG en commun", async () => {
    await show("listening");
    await show("thinking");
    const ids = [...host.querySelectorAll("[id]")].map((el) => el.id);
    expect(ids.length).toBeGreaterThan(2);
    expect(new Set(ids).size).toBe(ids.length);
    // Chaque dégradé de disque est référencé par SON dessin.
    for (const layer of layers()) {
      const gradient = layer.querySelector("radialGradient")!.id;
      expect(layer.querySelector(`circle[fill="url(#${gradient})"]`)).not.toBeNull();
    }
  });

  it("des changements rapides ne superposent jamais plus de deux dessins", async () => {
    await show("idle");
    await show("listening");
    await wait(100);
    await show("thinking");
    await wait(100);
    await show("working");
    expect(layers().length).toBeLessThanOrEqual(2);
    expect(states().at(-1)).toBe("working");
    await wait(ORB_SWITCH_MS);
    expect(states()).toEqual(["working"]);
  });

  it("ne laisse aucun minuteur derrière lui une fois démonté en plein fondu", async () => {
    await show("idle");
    await show("thinking");
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(host); // pour l'afterEach
  });
});

describe("orbe — durées d'animation", () => {
  it("le fondu et la figure partagent la durée dont dépend le retrait de l'ancien dessin", () => {
    // Les tests tournent depuis frontend/ (npm run test) : `import.meta.url` n'est pas une adresse de fichier sous jsdom.
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    for (const name of ["orb-enter", "orb-layer-in", "orb-halo-out"]) {
      const rule = new RegExp(`\\.${name}\\s*\\{[^}]*animation:\\s*${name}\\s+(\\d+)ms`).exec(css);
      expect(rule, `règle .${name}`).not.toBeNull();
      expect(Number(rule![1]), `durée de .${name}`).toBe(ORB_SWITCH_MS);
    }
  });
});
