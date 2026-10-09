"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";

/**
 * Fenêtre modale sur l'élément natif <dialog> (showModal) : couche supérieure,
 * arrière-plan inerte, piège de focus et Échap fournis par le navigateur.
 * Fermeture aussi au clic sur le voile. Le focus revient à l'élément d'origine.
 */
export function Dialog({
  open,
  onClose,
  label,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const previous = document.activeElement as HTMLElement | null;
      dialog.showModal();
      return () => previous?.focus?.();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        // Clic sur le voile : la cible est le <dialog> lui-même, pas son contenu.
        if (event.target === event.currentTarget) onClose();
      }}
      className={`dialog-pop m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-hidden rounded-panel bg-surface p-0 text-ink shadow-float backdrop:bg-ink/30 ${className}`}
    >
      {open && children}
    </dialog>
  );
}

/** En-tête standard : titre, sous-titre facultatif, bouton fermer. */
export function DialogHeader({ title, subtitle, closeLabel, onClose, children }: { title: ReactNode; subtitle?: ReactNode; closeLabel: string; onClose: () => void; children?: ReactNode }) {
  return (
    <header className="flex items-start gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-panel-title font-medium text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-meta text-ink-3">{subtitle}</p>}
      </div>
      {children}
      <button type="button" onClick={onClose} aria-label={closeLabel} className="-mr-1.5 rounded-button p-1.5 text-ink-3 hover:bg-active hover:text-ink">
        <CloseIcon size={18} />
      </button>
    </header>
  );
}
