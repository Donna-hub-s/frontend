"use client";

import { useSyncExternalStore } from "react";

/**
 * Horloge qui avance de seconde en seconde, UNIQUEMENT tant qu'au moins un
 * composant en a besoin (`active`).
 *
 * Une seule horloge pour toute la page, jamais une par liste ni par élément :
 * dix étapes et trois cartes de recherche ne créent qu'un intervalle. Elle
 * s'arrête dès que plus personne ne la suit — un compteur qui tourne sur un
 * écran au repos réveille l'onglet pour rien.
 */

let current = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Recalée dès l'abonnement : la valeur peut dater de la dernière période active.
  current = Date.now();
  timer ??= setInterval(() => {
    current = Date.now();
    listeners.forEach((notify) => notify());
  }, 1_000);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Abonnement vide, d'identité stable : sans quoi React se réabonnerait à chaque rendu. */
const unsubscribed = () => () => {};

/** `Date.now()` rafraîchi chaque seconde tant que `active` ; figé (et sans intervalle) sinon. */
export function useNow(active: boolean): number {
  return useSyncExternalStore(
    active ? subscribe : unsubscribed,
    () => current,
    // Rendu serveur : aucune durée n'a de sens avant l'hydratation (voir visibleElapsed : un « maintenant » à 0 reste muet).
    () => 0,
  );
}
