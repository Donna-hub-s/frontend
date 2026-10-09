// @vitest-environment node
// Le logo posé directement sur la page (variante « plain ») suit le thème ; les variantes à tuile gardent leur palette fixe.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DonnaMark } from "./donna-mark";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const html = (variant: "plain" | "tile" | "dark" | "circle") => renderToStaticMarkup(createElement(DonnaMark, { size: 40, variant, label: "" }));

/** Les cinq couleurs du logo, dans l'ordre : ruban (de, vers), reflet, ombre, ombre profonde. */
function colors(markup: string): string[] {
  const stops = [...markup.matchAll(/stop-color="([^"]+)"/g)].map((m) => m[1]);
  const fills = [...markup.matchAll(/<path[^>]*\sfill="(#[0-9A-Fa-f]{6}|var\(--[a-z-]+\))"/g)].map((m) => m[1]);
  return [...stops, ...fills].map((value) => value.toLowerCase());
}

const NAMES = ["from", "to", "highlight", "shade", "deep"] as const;
const tokens = (block: string) => NAMES.map((name) => new RegExp(`--mark-${name}:\\s*(#[0-9a-f]{6})`, "i").exec(block)?.[1].toLowerCase());

describe("logo « plain » : suit le thème", () => {
  it("prend ses couleurs des jetons --mark-*, jamais d'une couleur fixe", () => {
    expect(colors(html("plain"))).toEqual(NAMES.map((name) => `var(--mark-${name})`));
  });

  it("les variantes à tuile gardent leur propre palette (leur fond ne change pas avec le thème)", () => {
    for (const variant of ["tile", "dark", "circle"] as const) expect(colors(html(variant)).join()).not.toContain("var(");
  });

  it("clair : les jetons valent la palette « light » (celle de la tuile claire)", () => {
    const light = /Couleurs du logo[^*]*\*\/\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(tokens(light)).toEqual(colors(html("tile")));
  });

  it("sombre : les jetons valent la palette « onDark » — le logo s'inverse, comme sur la tuile sombre", () => {
    const dark = /:root\[data-theme="dark"\]\s*\{([^}]*--mark-from[^}]*)\}/.exec(css)?.[1] ?? "";
    expect(tokens(dark)).toEqual(colors(html("dark")));
  });
});
