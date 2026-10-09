"use client";

import { useEffect } from "react";
import { applyTheme, isTheme, readStoredTheme, storeTheme, watchSystemTheme, type Theme } from "@/lib/theme";

/**
 * Recale le thème sur le profil, et suit le système tant que la préférence vaut
 * « system ».
 *
 * Le script du <head> a déjà posé le thème à partir du miroir local (voir
 * lib/theme.ts) : ici on ne fait que corriger APRÈS coup si le profil dit autre
 * chose — cas d'un autre appareil, ou d'un navigateur qui découvre le compte.
 * Un échec de lecture laisse simplement le thème local en place.
 */
export function ThemeSync() {
  useEffect(() => {
    let stopWatching = () => {};
    let current: Theme = readStoredTheme();

    const follow = () => {
      stopWatching();
      // Seul « system » a besoin d'être suivi : un choix explicite ne bouge pas
      // quand le système bascule (coucher du soleil, bascule manuelle de l'OS).
      stopWatching = current === "system" ? watchSystemTheme(() => applyTheme("system")) : () => {};
    };
    follow();

    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/donna/profile/me", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const { theme } = (await response.json()) as { theme?: unknown };
        if (!isTheme(theme) || theme === current) return;
        current = theme;
        storeTheme(theme);
        applyTheme(theme);
        follow();
      } catch {
        // Profil injoignable : le thème déjà posé reste valable.
      }
    })();

    return () => {
      controller.abort();
      stopWatching();
    };
  }, []);

  return null;
}
