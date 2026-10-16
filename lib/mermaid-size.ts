// Taille d'un diagramme Mermaid dans le fil de discussion. Le SVG de Mermaid porte sa taille naturelle dans son `viewBox` ;
// l'ancien cadre en reprenait seulement le RAPPORT largeur/hauteur et le tendait à la largeur de la colonne — un diagramme en
// ligne de dix étapes (rapport 25:1) devenait une bande de 25 px de haut, texte illisible. Ici la taille naturelle reste la
// référence : le diagramme se réduit pour tenir dans la colonne, mais jamais sous `MIN_SCALE` (au-delà, il défile) ; un grand
// affichage permet de zoomer.

export type Size = { width: number; height: number };

/** Échelle plancher dans le fil : le texte de Mermaid (16 px) reste à ≈ 11 px, lisible. En dessous, le cadre défile. */
export const MIN_SCALE = 0.7;

const VIEWBOX = /viewBox="\s*[-\d.e+]+[\s,]+[-\d.e+]+[\s,]+([\d.e+]+)[\s,]+([\d.e+]+)\s*"/;

/** La taille naturelle d'un SVG de Mermaid (son `viewBox`), ou null si elle n'est pas lisible ou n'a aucun sens. */
export function naturalSize(svg: string): Size | null {
  const match = VIEWBOX.exec(svg);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Le style du cadre dans le fil : sa taille naturelle quand la colonne la contient, la largeur de la colonne quand le diagramme est un peu
 * plus large (réduit), et `MIN_SCALE` de sa taille quand il serait trop réduit — le conteneur défile alors. La hauteur suit le rapport.
 */
export function inlineBox(size: Size): { width: string; aspectRatio: string } {
  const natural = Math.round(size.width);
  const floor = Math.round(size.width * MIN_SCALE);
  return { width: `max(min(100%, ${natural}px), ${floor}px)`, aspectRatio: `${size.width} / ${size.height}` };
}

export const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3] as const;

/** Le niveau de zoom suivant (+1) ou précédent (−1) ; reste aux bornes. Un niveau hors liste va vers le plus proche voisin dans le sens demandé. */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction === 1) return ZOOMS.find((z) => z > current + 1e-9) ?? ZOOMS[ZOOMS.length - 1];
  return [...ZOOMS].reverse().find((z) => z < current - 1e-9) ?? ZOOMS[0];
}

/** Le zoom qui fait tenir la largeur du diagramme dans `available` pixels, borné au jeu de zooms. */
export function fitZoom(size: Size, available: number): number {
  if (!(available > 0)) return 1;
  return Math.min(ZOOMS[ZOOMS.length - 1], Math.max(ZOOMS[0], available / size.width));
}

/** La largeur en pixels du diagramme à ce zoom. */
export const zoomedWidth = (size: Size, zoom: number): number => Math.round(size.width * zoom);

/** Le zoom d'ouverture du grand affichage : la taille naturelle (texte à 16 px) si elle tient, sinon réduite pour tenir sans descendre sous 75 % —
 * un grand affichage dont on ne lit pas le texte n'apporte rien : au-delà, on fait défiler. */
export const initialZoom = (size: Size, available: number): number => Math.max(0.75, Math.min(1, fitZoom(size, available)));
