"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import {
  POLL_MS,
  cancelDriveFolderImportRun,
  fetchDriveFolderImportRun,
  isFinished,
  visibleSteps,
  type DriveFolderImportRun,
} from "@/lib/drive-folder-import";
import { CheckIcon, CloseIcon } from "./icons";

type Labels = Dictionary["workspace"]["projects"]["driveFolderImport"];

/**
 * Suivi d'un import de dossier Drive une fois démarré (voir DrivePicker) : il tourne en tâche de fond côté
 * serveur (backend/app/chat/src/drive_folder_import.py) ; on lit son état toutes les quelques secondes
 * (fichiers trouvés/importés/échoués/ignorés, dernières étapes) jusqu'à la fin. Même squelette que
 * ResearchProgress. `onFinished` rappelé une fois, à la fin quelle qu'en soit l'issue — le parent en profite
 * pour rafraîchir la liste des documents du projet.
 */
export function DriveFolderImportProgress({
  projectId,
  run: initialRun,
  labels,
  onFinished,
  onDismiss,
}: {
  projectId: string;
  run: DriveFolderImportRun;
  labels: Labels;
  onFinished?: (run: DriveFolderImportRun) => void;
  onDismiss?: () => void;
}) {
  const [run, setRun] = useState(initialRun);
  const [cancelling, setCancelling] = useState(false);
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (isFinished(run.status)) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const result = await fetchDriveFolderImportRun(projectId, run.id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un seul suivi par run.id, voir ResearchProgress
  }, [projectId, run.id]);

  const steps = visibleSteps(run.steps);
  const name = run.folder_name ?? labels.unnamedFolder;
  const counts = labels.counts
    .replace("{found}", String(run.files_found))
    .replace("{imported}", String(run.files_imported))
    .replace("{failed}", String(run.files_failed))
    .replace("{skipped}", String(run.files_skipped));

  if (run.status === "running") {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3" role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-label font-medium text-brand">
          <span className="pending-dot size-1.5 rounded-full bg-brand-fill" />
          {labels.running.replace("{name}", name)}
        </p>
        <p className="text-meta text-ink-3">{counts}</p>
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
            await cancelDriveFolderImportRun(projectId, run.id);
            setCancelling(false);
          }}
          className="self-start rounded-button bg-fill px-3 py-1.5 text-label font-medium text-ink hover:bg-active disabled:opacity-60"
        >
          {labels.cancel}
        </button>
      </div>
    );
  }

  const succeeded = run.status === "done" || run.status === "capacity_reached";
  const statusLabel =
    run.status === "done" ? labels.done.replace("{name}", name)
    : run.status === "capacity_reached" ? labels.capacityReached.replace("{name}", name)
    : run.status === "cancelled" ? labels.cancelled
    : run.status === "interrupted" ? labels.interrupted
    : labels.failed;

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3" role="status" aria-live="polite">
      <p className={`flex items-center gap-1.5 text-label font-medium ${succeeded ? "text-success-ink" : "text-ink-3"}`}>
        {succeeded ? <CheckIcon size={14} /> : <CloseIcon size={14} />}
        {statusLabel}
      </p>
      <p className="text-meta text-ink-3">{counts}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="self-start rounded-button px-3 py-1.5 text-label font-medium text-ink hover:bg-active">
          {labels.dismiss}
        </button>
      )}
    </div>
  );
}
