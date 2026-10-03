"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import { POLL_MS, cancelRun, fetchRun, formatUsd, isFinished, visibleSteps, type ResearchRun } from "@/lib/research";
import { CheckIcon, CloseIcon } from "./icons";

type Labels = Dictionary["workspace"]["chat"];

/**
 * Suivi d'une recherche approfondie une fois APPROUVÉE : elle tourne en tâche de fond côté serveur ; on lit son état toutes les
 * quelques secondes (étapes, pages lues) jusqu'à la fin. `onFinished` est rappelé une fois par suivi, à la fin quelle qu'en soit
 * l'issue — c'est lui qui va chercher le rapport (voir ActionCard).
 */
export function ResearchProgress({
  actionId,
  lang,
  labels,
  onFinished,
  onShowReport,
}: {
  actionId: string;
  lang: Locale;
  labels: Labels;
  onFinished?: (run: ResearchRun) => void;
  onShowReport?: (messageId: string) => void;
}) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const result = await fetchRun(actionId);
      if (!live) return;
      if (result) {
        setRun(result);
        if (isFinished(result.status)) {
          finishedRef.current?.(result);
          return;
        }
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [actionId]);

  if (!run) return <p className="mt-3 text-secondary text-ink-3">{labels.researchStarting}</p>;

  const steps = visibleSteps(run.steps);
  const pages = labels.researchPages.replace("{read}", String(run.pages_read)).replace("{failed}", String(run.pages_failed));

  if (run.status === "running") {
    return (
      <div className="mt-3 flex flex-col gap-2" role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-label font-medium text-bordeaux-700">
          <span className="pending-dot size-1.5 rounded-full bg-bordeaux-700" />
          {labels.researchRunning}
          <span className="font-normal text-ink-3">· {pages}</span>
        </p>
        {steps.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-meta text-ink-2">
            {steps.map((step, index) => (
              <li key={`${step.at}-${index}`} className={step.kind === "failed" ? "text-danger" : ""}>
                {step.label}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={cancelling}
          onClick={async () => {
            setCancelling(true);
            await cancelRun(run.id);
            setCancelling(false);
          }}
          className="self-start rounded-button bg-fill px-3 py-1.5 text-label font-medium text-ink hover:bg-active disabled:opacity-60"
        >
          {labels.researchCancel}
        </button>
      </div>
    );
  }

  if (run.status === "done") {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-label font-medium text-success-ink">
          <CheckIcon size={14} />
          {labels.researchDone}
          <span className="font-normal text-ink-3">· {pages}</span>
        </p>
        {run.cost_usd !== null && (
          <p className="text-meta text-ink-3">{labels.researchCost.replace("{cost}", formatUsd(run.cost_usd, lang))}</p>
        )}
        {run.report_message_id && onShowReport && (
          <button
            type="button"
            onClick={() => onShowReport(run.report_message_id as string)}
            className="self-start rounded-button bg-bordeaux-700 px-3 py-1.5 text-label font-medium text-white hover:bg-bordeaux-900"
          >
            {labels.researchShow}
          </button>
        )}
      </div>
    );
  }

  return (
    <p className="mt-3 flex items-center gap-1.5 text-label text-ink-3">
      <CloseIcon size={14} />
      {run.status === "cancelled" ? labels.researchCancelled : run.status === "interrupted" ? labels.researchInterrupted : labels.researchFailed}
      {run.error && run.status === "failed" && <span className="text-meta">· {run.error}</span>}
    </p>
  );
}
