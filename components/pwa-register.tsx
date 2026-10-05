"use client";

import { useEffect } from "react";
import { captureInstallPrompt } from "@/lib/pwa";

/**
 * Racine de l'application installable : enregistre le service worker (public/sw.js : coquille hors ligne, rien de personnel en
 * cache) et capte l'invite d'installation avant que personne ne la demande. Production seulement : en développement, les
 * fichiers statiques ne sont pas nommés par empreinte et un cache les ferait servir périmés.
 */
export function PwaRegister() {
  useEffect(() => captureInstallPrompt(), []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Sans service worker l'application fonctionne comme avant : seule la page hors connexion manque.
    });
  }, []);

  return null;
}
