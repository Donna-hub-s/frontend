"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";

/**
 * Volet de document, surface unique pour consulter un fichier ET éditer un document partagé.
 *
 * Même comportement partout : colonne de droite sur grand écran (la conversation reste utilisable à
 * côté), plein écran sur téléphone. `Échap` ferme, le voile ferme sur téléphone, le focus entre dans
 * le volet puis revient à l'élément d'origine. Tant qu'un volet est ouvert, `body[data-sheet-open]`
 * est posé : le panneau d'activité (side-panel.tsx) s'efface pour lui laisser la place.
 */

// Plusieurs volets peuvent coexister (aperçu par-dessus un document) : un compteur, pas un booléen.
let openSheets = 0;
const setFlag = (delta: number) => {
  openSheets = Math.max(0, openSheets + delta);
  if (openSheets > 0) document.body.dataset.sheetOpen = "true";
  else delete document.body.dataset.sheetOpen;
};

export function Sheet({
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
  const ref = useRef<HTMLElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  // `onClose` change d'identité à chaque rendu des appelants : une ref évite de rejouer l'effet
  // (sinon le focus serait repris à chaque frappe saisie dans le document).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement | null;
    setFlag(1);
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      setFlag(-1);
      previous.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-40 bg-ink/25 lg:hidden" />
      <aside
        ref={ref}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className={`fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface outline-none lg:static lg:inset-auto lg:z-auto lg:w-[46%] lg:max-w-[46rem] lg:min-w-[24rem] lg:border-l lg:border-border ${className}`}
      >
        {children}
      </aside>
    </>
  );
}

/** En-tête commun aux volets : titre (ou nœud éditable), sous-titre, actions, fermeture. */
export function SheetHeader({
  title,
  subtitle,
  leading,
  closeLabel,
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
      {leading}
      <div className="min-w-0 flex-1">
        {typeof title === "string" ? <h2 className="truncate text-panel-title font-medium text-ink">{title}</h2> : title}
        {subtitle ? <p className="mt-0.5 truncate text-meta text-ink-3">{subtitle}</p> : null}
      </div>
      {children}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        title={closeLabel}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-button text-ink-2 hover:bg-active hover:text-ink"
      >
        <CloseIcon size={18} />
      </button>
    </header>
  );
}
