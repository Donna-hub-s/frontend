// Génère les icônes de l'application installable (public/icons/*.png) à partir du logo DONNA
// (components/brand/mark-paths.ts), avec la palette « circle » du composant DonnaMark : ruban pêche sur fond bordeaux.
// Dépend de `rsvg-convert` (paquet librsvg2-bin / librsvg) — outil de développement, pas du build : les PNG sont versionnés.
// Usage : node scripts/pwa-icons.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MARK_DEEP, MARK_HIGHLIGHT, MARK_SHADE, MARK_SILHOUETTE } from "../components/brand/mark-paths.ts";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(out, { recursive: true });

const P = { from: "#FDFAF8", to: "#E3ADAA", highlight: "#FFFFFF", shade: "#D99A98", deep: "#B7777A" };

/**
 * @param {number} size côté en pixels
 * @param {number} markScale part du côté occupée par le logo (la zone de sécurité d'une icône « maskable » est un disque de 80 %)
 * @param {number} radius arrondi des coins en part du côté (0 = fond plein, que l'appareil découpe lui-même)
 */
function icon(size, markScale, radius) {
  const mark = 100 * markScale;
  const offset = (100 - mark) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <defs>
    <radialGradient id="bg" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#7C3040"/><stop offset="0.6" stop-color="#591A29"/><stop offset="1" stop-color="#45131F"/></radialGradient>
    <linearGradient id="ribbon" x1="0.1" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${P.from}"/><stop offset="1" stop-color="${P.to}"/></linearGradient>
    <clipPath id="clip"><path d="${MARK_SILHOUETTE}"/></clipPath>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4"/></filter>
    <filter id="crisp" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.7"/></filter>
  </defs>
  <rect width="100" height="100" rx="${radius * 100}" fill="url(#bg)"/>
  <g transform="translate(${offset} ${offset}) scale(${markScale})">
    <path d="${MARK_SILHOUETTE}" fill="url(#ribbon)"/>
    <g clip-path="url(#clip)">
      <path d="${MARK_HIGHLIGHT}" fill="${P.highlight}" opacity="0.9" filter="url(#soft)"/>
      <path d="${MARK_SHADE}" fill="${P.shade}" opacity="0.85" filter="url(#soft)"/>
      <path d="${MARK_DEEP}" fill="${P.deep}" opacity="0.9" filter="url(#crisp)"/>
    </g>
  </g>
</svg>`;
}

const files = [
  ["icon-192.png", 192, 0.64, 0.22], // usage « any » : carré arrondi
  ["icon-512.png", 512, 0.64, 0.22],
  ["icon-maskable-512.png", 512, 0.52, 0], // « maskable » : fond plein, logo dans la zone de sécurité
  ["apple-touch-icon.png", 180, 0.62, 0], // iOS arrondit lui-même ; des coins transparents deviendraient noirs
];

for (const [name, size, scale, radius] of files) {
  const run = spawnSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-f", "png"], { input: icon(size, scale, radius) });
  if (run.status !== 0) throw new Error(`rsvg-convert a échoué pour ${name} : ${run.stderr}`);
  writeFileSync(join(out, name), run.stdout);
  console.log(`${name} (${size}×${size}, ${run.stdout.length} octets)`);
}
