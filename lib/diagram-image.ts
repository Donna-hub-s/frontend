// Un diagramme Mermaid (SVG) en image PNG, dessinée dans le navigateur : c'est ce que le serveur pose dans le PDF et le Word d'un
// export de conversation (backend/app/chat/src/diagrams.py) — seul un navigateur sait dessiner Mermaid.
//
// Le SVG doit être « à étiquettes simples » (`renderMermaidSvg(…, { plainLabels: true })`) : les étiquettes HTML de Mermaid sont des
// `<foreignObject>`, et un SVG qui en contient SOUILLE le canevas (mesuré dans Chromium : `toDataURL` lève « Tainted canvases may not be
// exported »). Sans elles, le canevas reste exportable.

import type { Size } from "./mermaid-size";
import { naturalSize } from "./mermaid-size";

/** Échelle du dessin (2 = deux pixels par pixel d'écran : net sur papier) et plus grand côté permis — le même plafond que le serveur. */
export const EXPORT_SCALE = 2;
export const MAX_SIDE = 4096;

/** Les dimensions du PNG : l'échelle voulue, réduite si le plus grand côté dépasse le plafond. */
export function exportDimensions(size: Size, scale = EXPORT_SCALE, maxSide = MAX_SIDE): Size {
  const factor = Math.min(scale, maxSide / Math.max(size.width, size.height));
  return { width: Math.max(1, Math.round(size.width * factor)), height: Math.max(1, Math.round(size.height * factor)) };
}

const ROOT_TAG = /<svg\b[^>]*>/;

const FRONT_MATTER = /^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const PLAIN_LABELS_DIRECTIVE = '%%{init: {"htmlLabels": false, "flowchart": {"htmlLabels": false}}}%%\n';

/**
 * La source avec la directive « étiquettes simples » en tête (après l'éventuel bloc `---` de métadonnées, qui doit rester le premier). Les
 * clés de thème restent verrouillées par `secure` (voir mermaid-diagram.tsx) : cette directive est la nôtre, une directive du diagramme
 * qui la contredirait ne ferait que rendre l'image impossible, jamais changer l'apparence de l'application.
 */
export function withPlainLabels(source: string): string {
  const front = FRONT_MATTER.exec(source);
  return front ? source.slice(0, front[0].length) + PLAIN_LABELS_DIRECTIVE + source.slice(front[0].length) : PLAIN_LABELS_DIRECTIVE + source;
}

/**
 * Le même SVG avec une taille explicite en pixels sur sa balise racine (Mermaid écrit `width="100%"` et un `max-width` en style : sans
 * taille, une image SVG se dessine à 300×150). Seule la balise racine est touchée ; le reste du dessin est inchangé.
 */
export function withExplicitSize(svg: string, size: Size): string {
  return svg.replace(ROOT_TAG, (tag) => {
    const cleaned = tag
      .replace(/\s(?:width|height)="[^"]*"/g, "")
      .replace(/\sstyle="[^"]*"/g, "")
      .replace(/>$/, "");
    return `${cleaned} width="${size.width}" height="${size.height}">`;
  });
}

/**
 * Le PNG (base64, sans préfixe `data:`) d'un SVG à étiquettes simples, sur fond blanc ; null si le navigateur ne sait pas le dessiner ou
 * l'exporter. Ne lève jamais : un diagramme qui échoue reste, dans l'export, un bloc de code.
 */
export async function svgToPngBase64(svg: string): Promise<string | null> {
  const size = naturalSize(svg);
  if (!size || typeof document === "undefined") return null;
  const target = exportDimensions(size);
  let url: string | null = null;
  try {
    const objectUrl = URL.createObjectURL(new Blob([withExplicitSize(svg, size)], { type: "image/svg+xml;charset=utf-8" }));
    url = objectUrl;
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("délai dépassé")), 10_000); // un export ne doit jamais rester suspendu
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error("image illisible"));
      };
      image.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png"); // lève si le canevas est souillé
    const comma = dataUrl.indexOf(",");
    return comma > 0 ? dataUrl.slice(comma + 1) : null;
  } catch {
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
