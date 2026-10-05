// Extraction de la géométrie de l'orbe depuis les états validés de fondations/etats (donna-orb-<état>.svg).
// Partagé par scripts/orb-geometry.mjs (qui écrit components/brand/orb-geometry.ts) et par le test de dérive
// (components/brand/donna-orb.test.ts) : la référence est la SEULE source, rien n'est recopié à la main.
import { readFileSync } from "node:fs";

/** état → préfixe des identifiants SVG de la référence. */
export const STATES = { idle: "idle", listening: "listen", thinking: "think", working: "work", answering: "ans" };

const LISERE = 'stroke-opacity="0.55" stroke-width="0.8"/>';

/**
 * Crochets d'animation : une classe posée sur des éléments de la référence, repérés par leur STRUCTURE (jamais par une valeur
 * numérique : si la référence change un rayon, rien ne casse). Si la référence change de forme au point qu'un crochet ne
 * trouve plus rien, on échoue ici, bruyamment, plutôt que de perdre l'animation sans que personne le voie.
 */
const HOOKS = {
  // idle : le halo (dégradé « idle-glow ») respire
  idle: [{ find: /<circle (?=[^>]*fill="url\(#idle-glow\)")/g, cls: "orb-breathe", min: 1 }],
  // listening : chaque anneau (cercle sans remplissage) émet une onde
  listening: [{ find: /<circle (?=[^>]*fill="none")/g, cls: "orb-ring", min: 2 }],
};

function addClass(markup, { find, cls, min }, state) {
  let count = 0;
  const out = markup.replace(find, (match) => {
    count += 1;
    return `${match}class="${cls}" `;
  });
  if (count < min) throw new Error(`crochet « ${cls} » introuvable dans l'état « ${state} » (${count} élément(s), ${min} attendu(s)) : la référence a changé de forme`);
  return out;
}

/** Disque (3 couleurs), définitions, halo éventuel (derrière le disque) et figure animée d'UN état, à partir du texte de son SVG. */
export function extractState(svg, state) {
  const prefix = STATES[state];
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const defs = (inner.match(/<defs>([\s\S]*?)<\/defs>/) ?? ["", ""])[1];
  // Tout ce qui suit le disque et son liseré : la figure animée.
  const body = inner.replace(/<rect[^>]*\/>/, "").replace(/<defs>[\s\S]*?<\/defs>/, "");
  const at = body.indexOf(LISERE);
  if (at < 0) throw new Error(`liseré introuvable : ${state}`);
  // Ce qui est dessiné DERRIÈRE le disque (le halo de la réponse) : tout ce qui précède le disque. Vide pour les autres états.
  const discAt = body.indexOf(`<circle cx="50" cy="50" r="50" fill="url(#${prefix}-disc)"`);
  if (discAt < 0) throw new Error(`disque introuvable : ${state}`);
  let halo = body.slice(0, discAt).trim().replace(/\s+/g, " ");
  let figure = body.slice(at + LISERE.length).trim().replace(/\s+/g, " ");
  const disc = (defs.match(new RegExp(`<radialGradient id="${prefix}-disc"[\\s\\S]*?</radialGradient>`)) ?? [""])[0];
  if (!disc) throw new Error(`dégradé du disque introuvable : ${state}`);
  const stops = [...disc.matchAll(/stop-color="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
  if (stops.length !== 3) throw new Error(`le disque de « ${state} » doit avoir 3 couleurs, ${stops.length} trouvée(s)`);
  for (const hook of HOOKS[state] ?? []) figure = addClass(figure, hook, state);
  if (halo) halo = addClass(halo, { find: /<circle /g, cls: "orb-halo", min: 1 }, state); // le halo pulse doucement
  return { prefix, disc: stops, defs: defs.replace(disc, "").trim(), halo, figure };
}

/** La géométrie des cinq états, lue dans `sourceDir` (le dossier fondations/etats). */
export function buildGeometry(sourceDir) {
  const out = {};
  for (const state of Object.keys(STATES)) {
    out[state] = extractState(readFileSync(`${sourceDir}/donna-orb-${state}.svg`, "utf8"), state);
  }
  return out;
}
