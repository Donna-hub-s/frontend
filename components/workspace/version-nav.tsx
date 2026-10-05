"use client";

import { useState } from "react";
import { ChevronIcon, RegenerateIcon } from "./icons";

export type VersionNavLabels = { versionPrevious: string; versionNext: string };

/** Navigue entre les versions d'un message (éditions, régénérations) — ‹ i/n ›. `onSelect`
 * bascule la branche affichée côté serveur (voir workspace-provider.tsx::selectBranch) ;
 * un échec reste affiché localement, sans rien changer à la branche affichée. */
export function VersionNav({
  siblingIds,
  siblingIndex,
  onSelect,
  labels,
}: {
  siblingIds: string[];
  siblingIndex: number;
  onSelect: (messageId: string) => Promise<boolean>;
  labels: VersionNavLabels;
}) {
  const [busy, setBusy] = useState(false);
  const total = siblingIds.length;

  const go = async (nextIndex: number) => {
    if (busy || nextIndex < 0 || nextIndex >= total) return;
    setBusy(true);
    await onSelect(siblingIds[nextIndex]);
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-0.5 text-meta text-ink-3">
      <button
        type="button"
        disabled={busy || siblingIndex <= 0}
        aria-label={labels.versionPrevious}
        title={labels.versionPrevious}
        onClick={() => void go(siblingIndex - 1)}
        className="flex size-6 items-center justify-center rounded-full hover:bg-active hover:text-ink disabled:opacity-40"
      >
        <ChevronIcon size={11} className="rotate-90" />
      </button>
      <span className="tabular-nums">
        {siblingIndex + 1}/{total}
      </span>
      <button
        type="button"
        disabled={busy || siblingIndex >= total - 1}
        aria-label={labels.versionNext}
        title={labels.versionNext}
        onClick={() => void go(siblingIndex + 1)}
        className="flex size-6 items-center justify-center rounded-full hover:bg-active hover:text-ink disabled:opacity-40"
      >
        <ChevronIcon size={11} className="-rotate-90" />
      </button>
    </div>
  );
}

/** Bouton « régénérer » d'une réponse — voir workspace-provider.tsx::regenerate.
 * Optimiste : le contenu de la bulle change tout de suite ; un échec restaure l'ancienne
 * réponse côté provider, ce bouton se contente d'afficher une erreur transitoire. */
export function RegenerateButton({
  onRegenerate,
  label,
  errorLabel,
}: {
  onRegenerate: () => Promise<boolean>;
  label: string;
  errorLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const click = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    const ok = await onRegenerate();
    setBusy(false);
    if (!ok) setError(true);
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-label={label}
        title={label}
        onClick={() => void click()}
        className="flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-active hover:text-ink disabled:opacity-40"
      >
        <RegenerateIcon size={14} />
      </button>
      {error && <span role="status" className="text-meta text-danger">{errorLabel}</span>}
    </>
  );
}
