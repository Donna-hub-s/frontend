// Génère components/brand/orb-geometry.ts à partir des états validés de fondations/etats
// (fondations/etats/donna-orb-{idle,listening,thinking,working,answering}.svg), à la racine du dépôt.
// Usage (depuis frontend/) : node scripts/orb-geometry.mjs
// Un test (components/brand/donna-orb.test.ts) refuse un orb-geometry.ts qui ne correspond plus à la référence.
import { writeFileSync } from "node:fs";
import { buildGeometry } from "./orb-geometry-lib.mjs";

const SOURCE = "../fondations/etats";
const out = buildGeometry(SOURCE);

const banner = `// Généré par scripts/orb-geometry.mjs — ne pas modifier à la main.
// Source : fondations/etats (les cinq SVG validés : mesures relevées sur icone.png).
`;
writeFileSync("components/brand/orb-geometry.ts", `${banner}export const ORB_GEOMETRY = ${JSON.stringify(out, null, 2)} as const;\n`);
for (const [state, g] of Object.entries(out)) {
  console.log(state, "disque", g.disc.join(" "), "· figure", g.figure.length, "car.");
}
