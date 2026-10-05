// Aperçu réel du contenu d'une page — GET /app/chat/{id}/link-preview (via la passerelle
// /api/donna). Jamais déclenché par DONNA : un clic humain sur un lien déjà affiché dans
// la conversation. Le backend réutilise la lecture sûre de fetch_page (webfetch.py).

export type LinkPreview = { title: string; excerpt: string; url: string };

/** `message` : raison présentable renvoyée par le serveur (adresse refusée, site injoignable…),
 * `null` si le serveur n'a rien dit d'exploitable ou en cas de panne réseau. */
export async function fetchLinkPreview(
  conversationId: string,
  url: string,
): Promise<{ ok: true; data: LinkPreview } | { ok: false; message: string | null }> {
  try {
    const response = await fetch(
      `/api/donna/chat/${encodeURIComponent(conversationId)}/link-preview?url=${encodeURIComponent(url)}`,
    );
    if (response.ok) return { ok: true, data: (await response.json()) as LinkPreview };
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    return { ok: false, message: typeof body?.detail === "string" ? body.detail : null };
  } catch {
    return { ok: false, message: null };
  }
}
