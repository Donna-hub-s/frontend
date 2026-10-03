// Export d'une conversation — GET /app/chat/{id}/export?format=md|pdf|docx (via la passerelle /api/donna).

export const EXPORT_FORMATS = ["md", "pdf", "docx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Adresse de téléchargement : la passerelle porte le jeton (cookie), un simple lien suffit. */
export const exportHref = (conversationId: string, format: ExportFormat, lang: string): string =>
  `/api/donna/chat/${encodeURIComponent(conversationId)}/export?format=${format}&lang=${lang === "en" ? "en" : "fr"}`;
