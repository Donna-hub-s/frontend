"use client";

import { useSyncExternalStore } from "react";

const subscribe = (listener: () => void) => {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
};

/** Bandeau « hors connexion » : l'espace de travail déjà ouvert continue de s'afficher, mais DONNA ne peut ni lire ni répondre. */
export function OfflineBanner({ label }: { label: string }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="border-b border-border bg-fill px-4 py-2 text-center text-secondary text-ink">
      {label}
    </div>
  );
}
