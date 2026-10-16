// Export d'une conversation — GET /app/chat/{id}/export?format=md|pdf|docx (via la passerelle /api/donna).

export const EXPORT_FORMATS = ["md", "pdf", "docx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Adresse de téléchargement : la passerelle porte le jeton (cookie), un simple lien suffit. */
export const exportHref = (conversationId: string, format: ExportFormat, lang: string): string =>
  `/api/donna/chat/${encodeURIComponent(conversationId)}/export?format=${format}&lang=${lang === "en" ? "en" : "fr"}`;

// ── PDF et Word avec les diagrammes Mermaid ──────────────────────────────────────────────────────────────────────
// Seul le navigateur sait dessiner Mermaid (voir backend/app/chat/src/diagrams.py) : pour un PDF ou un Word, il demande la liste des
// diagrammes de la conversation, les dessine en images PNG, puis les renvoie avec la demande d'export — le serveur les pose à la place
// des blocs de code. Sans diagramme, ou si le dessin échoue, l'export passe par le simple lien (`exportHref`), comme avant.

export type DiagramSource = { id: string; source: string };

export const exportDiagramsUrl = (conversationId: string): string => `/api/donna/chat/${encodeURIComponent(conversationId)}/export/diagrams`;
export const exportPostUrl = (conversationId: string): string => `/api/donna/chat/${encodeURIComponent(conversationId)}/export`;

export type ExportDeps = {
  /** Dessine une source Mermaid en SVG à étiquettes simples (voir lib/diagram-image.ts). */
  render: (source: string, id: string) => Promise<string>;
  /** Le PNG (base64) d'un SVG, ou null. */
  rasterize: (svg: string) => Promise<string | null>;
  fetch?: typeof fetch;
};

export type ExportOutcome =
  | { kind: "link" } // rien à dessiner (ou dessin impossible) : le lien d'export suffit
  | { kind: "file"; blob: Blob; filename: string }
  | { kind: "error" };

/** Le nom de fichier d'un en-tête Content-Disposition (RFC 6266) : `filename*` en priorité, sinon `filename`. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // encodage invalide : on retombe sur `filename`
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"/i.exec(header) ?? /filename\s*=\s*([^;]+)/i.exec(header);
  return plain ? plain[1].trim() : fallback;
}

/**
 * Prépare l'export d'une conversation. Markdown : toujours le lien. PDF/Word : s'il y a des diagrammes, ils sont dessinés puis envoyés ;
 * un diagramme qui ne se dessine pas est simplement omis (il reste du code dans le fichier). Ne lève jamais.
 */
export async function prepareExport(conversationId: string, format: ExportFormat, lang: string, deps: ExportDeps): Promise<ExportOutcome> {
  return prepareExportAt({ listUrl: exportDiagramsUrl(conversationId), postUrl: exportPostUrl(conversationId) }, format, lang, deps);
}

/** Les deux adresses d'un export avec diagrammes : la liste à dessiner (GET) et l'envoi des images (POST) — celles d'une conversation ou d'un document partagé. */
export type ExportTarget = { listUrl: string; postUrl: string };

export async function prepareExportAt(target: ExportTarget, format: ExportFormat, lang: string, deps: ExportDeps): Promise<ExportOutcome> {
  if (format === "md") return { kind: "link" };
  const call = deps.fetch ?? fetch;
  let sources: DiagramSource[] = [];
  try {
    const listed = await call(target.listUrl, { cache: "no-store" });
    if (listed.ok) sources = ((await listed.json()) as { diagrams?: DiagramSource[] }).diagrams ?? [];
  } catch {
    return { kind: "link" };
  }
  if (!sources.length) return { kind: "link" };

  const images: Record<string, string> = {};
  for (const [index, diagram] of sources.entries()) {
    try {
      const png = await deps.rasterize(await deps.render(diagram.source, `export${index}`));
      if (png) images[diagram.id] = png;
    } catch {
      // Diagramme invalide ou moteur indisponible : il reste un bloc de code dans l'export.
    }
  }
  if (!Object.keys(images).length) return { kind: "link" };

  try {
    const response = await call(target.postUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format, lang: lang === "en" ? "en" : "fr", diagrams: images }),
    });
    if (!response.ok) return { kind: "error" };
    return { kind: "file", blob: await response.blob(), filename: filenameFromDisposition(response.headers.get("content-disposition"), `conversation.${format}`) };
  } catch {
    return { kind: "error" };
  }
}

/**
 * Enregistre le résultat d'une préparation d'export : le fichier reçu, ou — quand il n'y avait rien à dessiner — le lien d'export habituel
 * (`href`), que le navigateur télécharge comme avant. Un clic programmatique sur un lien `download` de même origine n'est pas bloqué.
 */
export function saveExport(outcome: Exclude<ExportOutcome, { kind: "error" }>, href: string): void {
  const link = document.createElement("a");
  link.download = outcome.kind === "file" ? outcome.filename : "";
  link.href = outcome.kind === "file" ? URL.createObjectURL(outcome.blob) : href;
  link.click();
  if (outcome.kind === "file") setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
