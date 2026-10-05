// Branches de conversation (éditer un message, régénérer une réponse, naviguer entre
// versions) — POST /app/chat/{id}/messages/{id}/select (via la passerelle /api/donna).
import type { MessageOut } from "./api";

/** Bascule sur la branche qui passe par `messageId` (jusqu'à sa feuille) et renvoie la
 * branche affichée complète. `null` si le serveur refuse ou en cas de panne réseau —
 * l'appelant laisse alors la branche affichée inchangée. */
export async function selectMessageBranch(conversationId: string, messageId: string): Promise<MessageOut[] | null> {
  try {
    const response = await fetch(
      `/api/donna/chat/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/select`,
      { method: "POST" },
    );
    return response.ok ? ((await response.json()) as MessageOut[]) : null;
  } catch {
    return null;
  }
}

/** Le backend ajoute toujours la nouvelle version à la FIN de l'ordre des versions
 * (voir branches.py::siblings_of, trié par created_at) : éditer/régénérer peut donc
 * calculer la liste mise à jour sans round-trip. `oldSiblingIds` vide ou absent = la
 * version qu'on remplace était la seule connue jusqu'ici. */
export function nextSiblings(
  oldSiblingIds: string[] | undefined,
  oldServerId: string,
  newServerId: string,
): { siblingIds: string[]; siblingIndex: number } {
  const ids = oldSiblingIds?.length ? oldSiblingIds : [oldServerId];
  return { siblingIds: [...ids, newServerId], siblingIndex: ids.length };
}
