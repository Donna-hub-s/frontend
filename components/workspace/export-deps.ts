import { svgToPngBase64 } from "@/lib/diagram-image";
import type { ExportDeps } from "@/lib/conversation-export";

/**
 * Ce qu'il faut au navigateur pour dessiner les diagrammes d'un export : Mermaid en SVG à étiquettes simples (un SVG avec les étiquettes HTML
 * de Mermaid souille le canevas, voir lib/diagram-image.ts), puis le PNG. Le moteur, volumineux, n'est chargé qu'au premier diagramme.
 */
export const browserExportDeps = (): ExportDeps => ({
  render: async (source, id) => (await import("./mermaid-diagram")).renderMermaidSvg(source, id, { plainLabels: true }),
  rasterize: svgToPngBase64,
});
