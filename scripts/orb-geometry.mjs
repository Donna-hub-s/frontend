// Génère components/brand/orb-geometry.ts à partir des états validés
// (design/fondations/etats/donna-orb-{thinking,working,answering}.svg).
// Usage : node scripts/orb-geometry.mjs
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "../design/fondations/etats";
const STATES = { thinking: "think", working: "work", answering: "ans" };

const out = {};
for (const [state, prefix] of Object.entries(STATES)) {
  const svg = readFileSync(`${SOURCE}/donna-orb-${state}.svg`, "utf8");
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const defs = (inner.match(/<defs>([\s\S]*?)<\/defs>/) ?? ["", ""])[1];
  // Tout ce qui suit le disque et son liseré : la figure animée.
  const body = inner.replace(/<rect[^>]*\/>/, "").replace(/<defs>[\s\S]*?<\/defs>/, "");
  const liseré = body.indexOf('stroke-opacity="0.55" stroke-width="0.8"/>');
  if (liseré < 0) throw new Error(`liseré introuvable : ${state}`);
  const figure = body.slice(liseré + 'stroke-opacity="0.55" stroke-width="0.8"/>'.length).trim();
  const disc = (defs.match(new RegExp(`<radialGradient id="${prefix}-disc"[\\s\\S]*?</radialGradient>`)) ?? [""])[0];
  const figureDefs = defs.replace(disc, "").trim();
  const stops = [...disc.matchAll(/stop-color="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
  out[state] = { prefix, disc: stops, defs: figureDefs, figure: figure.replace(/\s+/g, " ") };
}

const banner = `// Généré par scripts/orb-geometry.mjs — ne pas modifier à la main.
// Source : design/fondations/etats (mesures relevées sur icone.png).
`;
writeFileSync(
  "components/brand/orb-geometry.ts",
  `${banner}export const ORB_GEOMETRY = ${JSON.stringify(out, null, 2)} as const;\n`,
);
for (const [state, g] of Object.entries(out)) {
  console.log(state, "disque", g.disc.join(" "), "· figure", g.figure.length, "car.");
}
