/**
 * Choix de ce que l'accueil montre.
 *
 * Isolé de l'affichage parce que c'est la seule partie qui peut se tromper en
 * silence : un tri à l'envers ou un seuil mal posé donne un écran plausible mais
 * faux (les plus vieilles conversations en haut, des raccourcis affichés à
 * quelqu'un qui a dix fils en cours).
 */

import type { ConversationOut } from "./api";

/** Au-delà, ce n'est plus un rappel mais un historique — c'est le rôle du panneau latéral. */
export const MAX_RECENT = 5;

/** Dernière activité connue. `updated_at` est absent des mises à jour optimistes
 * locales (voir workspace-provider), d'où le repli sur la création. */
const touchedAt = (conversation: ConversationOut): string => conversation.updated_at ?? conversation.created_at ?? "";

/** Les conversations les plus récemment touchées, la plus fraîche d'abord. */
export function recentConversations(conversations: readonly ConversationOut[], max: number = MAX_RECENT): ConversationOut[] {
  return [...conversations].sort((a, b) => touchedAt(b).localeCompare(touchedAt(a))).slice(0, max);
}

/**
 * Compte encore vide : rien à valider ET rien à reprendre. C'est le SEUL cas où
 * l'accueil montre des raccourcis de découverte ; dès qu'il y a quelque chose à
 * reprendre, trois amorces de texte ne seraient que du bruit devant l'essentiel.
 */
export function isBareHome(pendingCount: number, recentCount: number): boolean {
  return pendingCount === 0 && recentCount === 0;
}
