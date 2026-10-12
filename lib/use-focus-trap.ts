"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Boucle le focus (Tab / Shift+Tab) à l'intérieur de `ref` tant que `active` — pour les menus/
 * overlays `role="dialog"` MAISON (model-menu, agent-menu, search-palette, link-card) qui n'ont
 * pas le piège de focus natif du `<dialog>` partagé (voir dialog.tsx) : sans ça, Tab fait sortir
 * le clavier du menu ouvert vers la page derrière. Ne touche ni à l'ouverture/fermeture ni au
 * focus initial — seulement ce qui se passe à la touche Tab, la gestion Échap existante de
 * chaque appelant reste inchangée.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ref, active]);
}
