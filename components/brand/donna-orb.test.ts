// @vitest-environment node
// Garde de dérive de l'orbe : le rendu de DonnaOrb doit rester celui de la référence (fondations/etats/*.svg, à la racine du dépôt).
// Avant ce test, idle et listening étaient recopiés à la main dans le composant — et l'écoute dessinait un seul anneau là où la
// référence en a deux. Désormais les cinq états viennent de la référence (scripts/orb-geometry.mjs) et ce test le vérifie.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildGeometry, extractState, STATES } from "../../scripts/orb-geometry-lib.mjs";
import { DonnaOrb, type OrbState } from "./donna-orb";
import { ORB_GEOMETRY } from "./orb-geometry";

const SPEC = fileURLToPath(new URL("../../../fondations/etats", import.meta.url));
const ALL = Object.keys(STATES) as OrbState[];
// La référence est à la racine du dépôt : sans elle (déploiement du seul dossier frontend), il n'y a rien à comparer.
const withSpec = describe.skipIf(!existsSync(SPEC));

const spec = (state: OrbState) => readFileSync(`${SPEC}/donna-orb-${state}.svg`, "utf8");
const render = (state: OrbState) => renderToStaticMarkup(createElement(DonnaOrb, { state }));

/**
 * Ce qui se voit, sans ce qui n'a pas de rendu : cercles, tracés, arrêts de dégradé, flous — avec leurs attributs triés, sans classe,
 * sans identifiant ni référence d'identifiant (le composant les rend uniques par instance). Le fond blanc de la référence (un
 * <rect>) n'en fait pas partie.
 */
function drawn(svg: string): string[] {
  const out: string[] = [];
  for (const [, tag, attrs] of svg.matchAll(/<(circle|path|stop|feGaussianBlur)\b([^>]*?)\/?>/g)) {
    const pairs = [...attrs.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)]
      .map(([, name, value]) => [name === "stopColor" ? "stop-color" : name, value] as const)
      .filter(([name]) => name !== "class" && name !== "id")
      .map(([name, value]) => `${name}=${value.replace(/url\(#[^)]*\)/g, "url(#)")}`)
      .sort();
    out.push(`${tag} ${pairs.join(" ")}`);
  }
  return out.sort();
}

withSpec("orbe de DONNA — fidèle à fondations/etats", () => {
  it("orb-geometry.ts est à jour : il vaut exactement ce que la référence produit", () => {
    // Si ceci échoue : la référence a changé, ou orb-geometry.ts a été touché à la main → `node scripts/orb-geometry.mjs`.
    expect(JSON.parse(JSON.stringify(ORB_GEOMETRY))).toEqual(buildGeometry(SPEC));
  });

  it.each(ALL)("« %s » : le rendu reprend tous les éléments dessinés de la référence, ni plus ni moins", (state) => {
    expect(drawn(render(state))).toEqual(drawn(spec(state)));
  });

  it("l'écoute a DEUX anneaux translucides, aux rayons de la référence (le défaut d'origine : un seul anneau opaque)", () => {
    // Un anneau : un cercle sans remplissage plus épais que le liseré du disque (0,8).
    const rings = [...render("listening").matchAll(/<circle[^>]*fill="none"[^>]*>/g)].map((m) => m[0]).filter((tag) => Number(/stroke-width="([\d.]+)"/.exec(tag)![1]) > 1);
    const radii = rings.map((tag) => Number(/ r="([\d.]+)"/.exec(tag)![1])).sort((a, b) => a - b);
    expect(radii).toEqual([22.5, 34.9]);
    expect(rings.map((tag) => /stroke-opacity="([\d.]+)"/.exec(tag)![1]).sort()).toEqual(["0.38", "0.55"]);
  });

  it("chaque état garde son animation : les crochets de la géométrie arrivent dans le rendu", () => {
    const count = (markup: string, cls: string) => (markup.match(new RegExp(`class="${cls}"`, "g")) ?? []).length;
    expect(count(render("idle"), "orb-breathe")).toBe(1); // le halo respire
    expect(count(render("listening"), "orb-ring")).toBe(2); // les deux anneaux émettent une onde
    expect(count(render("answering"), "orb-halo")).toBe(1); // le halo de la réponse pulse
    expect(render("thinking")).toContain('class="orb-think"');
    expect(render("working")).toContain('class="orb-work"');
    expect(render("answering")).toContain('class="orb-answer"');
  });

  it("deux orbes sur la même page ne partagent aucun identifiant SVG", () => {
    const ids = (markup: string) => [...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    const page = renderToStaticMarkup(createElement("div", null, createElement(DonnaOrb, { state: "listening" }), createElement(DonnaOrb, { state: "listening" })));
    const all = ids(page);
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("générateur — échoue bruyamment quand la référence change de forme", () => {
  const listening = `<svg xmlns="http://www.w3.org/2000/svg"><rect/><defs><radialGradient id="listen-disc"><stop stop-color="#FAEBE5"/><stop stop-color="#F7EEEA"/><stop stop-color="#F5F0EE"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#listen-disc)"/><circle cx="50" cy="50" r="49.6" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="0.8"/>`;

  it("une écoute sans deux anneaux perd son animation : refusé, pas silencieux", () => {
    expect(() => extractState(`${listening}<circle cx="50" cy="50" r="6.9" fill="url(#x)"/></svg>`, "listening")).toThrow(/crochet « orb-ring » introuvable/);
    expect(() => extractState(`${listening}<circle cx="50" cy="50" r="22.5" fill="none" stroke="#E9BDB6"/><circle cx="50" cy="50" r="6.9" fill="url(#x)"/></svg>`, "listening")).toThrow(/crochet « orb-ring »/);
    expect(extractState(`${listening}<circle cx="50" cy="50" r="22.5" fill="none" stroke="#E9BDB6"/><circle cx="50" cy="50" r="34.9" fill="none" stroke="#EAC6C0"/></svg>`, "listening").figure).toMatch(/class="orb-ring"[^>]*r="34.9"/);
  });

  it("un SVG sans liseré, sans disque ou à disque incomplet est refusé", () => {
    expect(() => extractState("<svg><defs></defs></svg>", "thinking")).toThrow(/liseré introuvable/);
    expect(() => extractState(`<svg><defs><radialGradient id="think-disc"><stop stop-color="#FFFFFF"/></radialGradient></defs><circle cx="50" cy="50" r="49.6" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="0.8"/></svg>`, "thinking")).toThrow(/disque introuvable/);
    expect(() => extractState(`<svg><defs><radialGradient id="think-disc"><stop stop-color="#FFFFFF"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#think-disc)"/><circle cx="50" cy="50" r="49.6" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="0.8"/></svg>`, "thinking")).toThrow(/3 couleurs/);
  });
});
