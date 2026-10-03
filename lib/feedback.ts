// Pouce haut / bas sur une réponse de DONNA — PUT /app/chat/messages/{id}/feedback (via la passerelle /api/donna).

export type Feedback = "up" | "down";

/** Longueur maximale du commentaire, comme côté serveur (FeedbackIn.reason). */
export const REASON_MAX = 500;

/** Cliquer sur le pouce déjà actif le retire ; sinon il remplace l'autre. */
export const nextFeedback = (current: Feedback | null | undefined, clicked: Feedback): Feedback | null => (current === clicked ? null : clicked);

/** Enregistre (ou retire, avec `rating` null) le retour. Renvoie false si le serveur ne l'a pas pris. */
export async function sendFeedback(messageId: string, rating: Feedback | null, reason?: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/donna/chat/messages/${encodeURIComponent(messageId)}/feedback`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating, reason: reason?.trim().slice(0, REASON_MAX) || null }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
