// Génère les illustrations de la landing : scènes unDraw (licence unDraw — usage
// commercial libre, sans attribution) recolorées aux tokens DONNA.
// Source : paquet npm undraw-svg (2.0.0). Usage : node scripts/illustrations.mjs <dossier undraw-svg>
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const pkg = process.argv[2];
if (!pkg) throw new Error("Chemin du paquet undraw-svg requis");

// Scène (nom de fichier) -> titre unDraw. Chaque scène montre explicitement la fonction illustrée.
const scenes = {
  emails: "Emails",
  whatsapp: "Chatting",
  calendar: "Calendar",
  documents: "File Search",
  production: "Organizing Data",
  memory: "Personal data",
  connect: "Sign Up",
  ask: "Chat with AI",
  approve: "Confirmation",
  security: "Secure server",
  relax: "A moment to relax",
  personal: "Online Meetings",
  team: "People",
};

// Ajustements par scène : éléments presque blancs rendus visibles sur fond clair.
const sceneOverrides = {
  relax: { "#eeebea": "#d9b9a5", "#f3f0ef": "#e8d2c4" },
  team: { "#f3f0ef": "#e8d2c4", "#eeebea": "#e8d2c4" },
};

// Couleurs unDraw -> tokens DONNA.
const palette = {
  // Accents sombres -> bordeaux ; aplats sombres -> brun-bordeaux ; gris froids -> gris chauds.
  "#090814": "#591a29", "#010102": "#591a29", "#272223": "#591a29",
  "#2f2e41": "#4a3438", "#3f3d56": "#7c3040", "#3f3d58": "#7c3040", "#707070": "#9a8f8d",
  "#e6e6e6": "#eeebea", "#e4e4e4": "#eeebea", "#e6e7e8": "#eeebea", "#dddedf": "#eeebea", "#dedfe0": "#eeebea",
  "#f2f2f2": "#f3f0ef", "#f0f0f0": "#f3f0ef",
  "#ccc": "#ddd6d4", "#cccccc": "#ddd6d4", "#cacaca": "#ddd6d4", "#cbcbcb": "#ddd6d4", "#b3b3b3": "#c9c0be",
  "#d6d6e3": "#f8e5d8", "#ccc9dd": "#f8e5d8",
  "#fd6584": "#e3adaa",
  // Peaux : les personnages d'origine sont presque tous clairs -> bruns et noirs.
  "#ed9da0": "#8d5a41", "#ffb6b6": "#8d5a41", "#ffb8b8": "#8d5a41", "#ffb7b7": "#8d5a41",
  "#faafb2": "#8d5a41", "#f1a1a4": "#8d5a41", "#ffb9b9": "#8d5a41", "#f6a6a9": "#8d5a41",
  "#e49497": "#7a4c37",
  "#a0616a": "#5e3a2b", "#9f616a": "#5e3a2b", "#9e616a": "#5e3a2b",
};

const out = "public/illustrations";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const catalog = JSON.parse(readFileSync(join(pkg, "illustrations.json"), "utf8"));
const files = readdirSync(join(pkg, "svgs"));
for (const [name, title] of Object.entries(scenes)) {
  const item = catalog.find((i) => i.title === title);
  const file =
    item &&
    (files.find((f) => f === `${item.slug}.svg` || f === `${item.newSlug}.svg`) ??
      files.find((f) => f.startsWith(item.newSlug) || f.startsWith(item.slug)));
  if (!file) throw new Error(`Illustration introuvable : ${title}`);
  let svg = readFileSync(join(pkg, "svgs", file), "utf8");
  // currentColor = couleur d'accent personnalisable d'unDraw (noire en <img>) -> accent DONNA.
  svg = svg.replace(/currentColor/g, "#7c3040");
  svg = svg.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (c) => palette[c.toLowerCase()] ?? c);
  const overrides = sceneOverrides[name] ?? {};
  svg = svg.replace(/#[0-9a-f]{6}\b/g, (c) => overrides[c] ?? c);
  svg = svg.replace(/<title>.*?<\/title>/s, "");
  // Formes sans fill (noir par défaut) : héritent d'un brun-bordeaux sombre.
  svg = svg.replace(/<svg\b(?![^>]*\sfill=)/, '<svg fill="#4a3438"');
  writeFileSync(join(out, `${name}.svg`), svg);
  console.log(`${name}.svg <- ${title}`);
}

writeFileSync(
  join(out, "LICENCE.md"),
  "# Illustrations\n\nScènes issues d'[unDraw](https://undraw.co) (Katerina Limpitsouni), via le paquet npm `undraw-svg` 2.0.0.\n" +
    "Licence unDraw : usage libre, y compris commercial, sans attribution ; interdit de les redistribuer comme bibliothèque d'illustrations concurrente.\n" +
    "Recolorées aux tokens DONNA (couleurs et teintes de peau) par `scripts/illustrations.mjs`.\n",
);
