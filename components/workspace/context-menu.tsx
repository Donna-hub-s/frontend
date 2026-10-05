"use client";

import { Gauge } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { clampPct, contextTone } from "@/lib/context";
import type { ContextStatusOut } from "@/lib/workspace-types";

type Labels = Dictionary["workspace"]["chat"];

const BAR: Record<string, string> = { ok: "bg-success", warn: "bg-bordeaux-700/70", high: "bg-danger" };

/**
 * Raccourci du chat : santé du contexte de la conversation et compaction à la demande. La compaction condense
 * les anciens messages en un résumé (les messages restent affichés) : même mécanique que la compaction
 * automatique du serveur, simplement immédiate.
 */
export function ContextMenu({
  labels,
  status,
  compacting,
  busy,
  onCompact,
}: {
  labels: Labels;
  status: ContextStatusOut | null;
  compacting: boolean;
  busy: boolean;
  /** Lance la compaction et renvoie le message à afficher (succès, rien à faire ou échec). */
  onCompact: () => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pct = status ? clampPct(status.context_budget_used_pct) : null;
  const tone = pct === null ? "ok" : contextTone(pct);
  const title = pct === null ? labels.contextMenu : labels.contextUsed.replace("{pct}", String(pct));

  return (
    <div ref={ref} className="sm:relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setMessage(null);
        }}
        aria-label={title}
        title={title}
        className={`inline-flex h-9 items-center gap-1.5 rounded-button px-2 text-meta tabular-nums transition-colors ${
          open ? "bg-active text-ink" : tone === "ok" ? "text-ink-2 hover:bg-active hover:text-ink" : tone === "warn" ? "text-bordeaux-700 hover:bg-active" : "text-danger hover:bg-active"
        }`}
      >
        <Gauge size={18} />
        {pct !== null && <span aria-hidden>{pct}%</span>}
      </button>

      {open && (
        <div role="group" aria-label={labels.contextMenu} className="absolute bottom-full inset-x-0 z-30 mb-2 sm:inset-x-auto sm:left-0 sm:w-[20rem] rounded-panel border border-border bg-white p-3 shadow-float">
          <p className="text-label font-medium text-ink">{labels.contextMenu}</p>
          {status && pct !== null ? (
            <>
              <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={title} className="mt-2 h-2 overflow-hidden rounded-full bg-active">
                <div className={`h-full rounded-full transition-[width] ${BAR[tone]}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-meta text-ink-2">{labels.contextUsed.replace("{pct}", String(pct))}</p>
              <p className="mt-2 text-meta text-ink-3">{labels.contextDetail.replace("{n}", String(status.recent_messages))}</p>
              <p className="text-meta text-ink-3">
                {status.compacted ? labels.contextCondensed.replace("{n}", String(status.covered_messages)) : labels.contextNone}
              </p>
            </>
          ) : (
            <p className="mt-2 text-meta text-ink-3">…</p>
          )}
          <p className="mt-2 text-meta text-ink-3 text-pretty">{labels.contextHint}</p>
          <button
            type="button"
            disabled={compacting || busy || !status}
            onClick={() => void onCompact().then(setMessage)}
            className="mt-3 w-full rounded-button bg-fill px-3 py-2 text-label font-medium text-ink hover:bg-active disabled:opacity-60"
          >
            {compacting ? labels.contextCompacting : labels.contextCompact}
          </button>
          {message && (
            <p role="status" className="mt-2 text-meta text-bordeaux-700">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
