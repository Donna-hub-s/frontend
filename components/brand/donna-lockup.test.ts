// @vitest-environment node
// Décisions de marque du 2026-10-09 (docs/frontend/design.md) : espacement adouci, signature hors de l'application.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DonnaLockup } from "./donna-mark";

const html = (props: { signature?: boolean } = {}) => renderToStaticMarkup(createElement(DonnaLockup, props));
const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

describe("DonnaLockup", () => {
  it("porte la signature par défaut (pages d'entrée) et peut s'en passer", () => {
    expect(html()).toContain("powered by xcore");
    expect(html({ signature: false })).not.toContain("powered by xcore");
    expect(html({ signature: false })).toContain("DONNA");
  });

  it("prend son espacement du jeton de marque, pas d'une valeur recopiée", () => {
    expect(html()).toContain("tracking-wordmark");
    expect(html()).not.toMatch(/tracking-\[/);
  });
});

describe("espacement de la marque", () => {
  it("une seule valeur par rôle, adoucie par rapport à la maquette (0,22 / 0,32 em)", () => {
    expect(/--tracking-wordmark:\s*0\.1em/.test(css)).toBe(true);
    expect(/--tracking-signature:\s*0\.18em/.test(css)).toBe(true);
    // Les classes de texte de la marque s'appuient sur ces jetons.
    expect(css).toMatch(/--text-wordmark--letter-spacing:\s*var\(--tracking-wordmark\)/);
    expect(css).toMatch(/--text-signature--letter-spacing:\s*var\(--tracking-signature\)/);
  });

  it("aucun composant ne recopie un espacement de wordmark à la main", () => {
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) scan(path);
        else if (/\.tsx$/.test(entry.name) && /font-brand[^"`]*tracking-\[0\.[12]\d*em\]/.test(readFileSync(path, "utf8"))) offenders.push(path);
      }
    };
    scan(resolve(process.cwd(), "components"));
    expect(offenders).toEqual([]);
  });
});

describe("signature « powered by xcore »", () => {
  it("n'apparaît jamais dans l'espace de travail : chaque DonnaLockup du workspace est sans signature", () => {
    const dir = resolve(process.cwd(), "components/workspace");
    const bad: string[] = [];
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".tsx"))) {
      const source = readFileSync(resolve(dir, file), "utf8");
      for (const [tag] of source.matchAll(/<DonnaLockup\b[^>]*\/>/g)) if (!/signature=\{false\}/.test(tag)) bad.push(`${file}: ${tag}`);
    }
    expect(bad).toEqual([]);
  });

  it("mais reste sur les pages d'entrée (landing, connexion, invitations)", () => {
    const entry = ["components/landing/header.tsx", "components/landing/sections.tsx", "app/[lang]/(auth)/layout.tsx", "app/[lang]/invitation/page.tsx"];
    for (const file of entry) expect(readFileSync(resolve(process.cwd(), file), "utf8")).toMatch(/<DonnaLockup size=\{\d+\} \/>/);
  });
});
