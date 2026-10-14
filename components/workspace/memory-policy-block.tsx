"use client";

import { useEffect, useId, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import {
  POLICIES,
  fetchProjectPolicy,
  fetchWorkspacePolicy,
  isAllowed,
  isPolicy,
  setProjectPolicy,
  setWorkspacePolicy,
  type MemoryPolicy,
  type MemoryPolicyOut,
  type WorkspacePolicyOut,
} from "@/lib/memory-policy";

type Labels = Dictionary["workspace"]["projects"];

const selectClass = "rounded-button border border-border bg-surface px-2 py-1 text-label text-ink disabled:opacity-60";

/**
 * Qui peut modifier la mémoire d'un projet : sa valeur (réglée par un propriétaire du projet), le plancher que l'espace impose à tous ses
 * projets (réglé par le responsable de l'espace) et la valeur appliquée. Le serveur refuse tout ce qui serait plus souple que le plancher ;
 * l'interface ne propose simplement pas ces choix. N'affiche rien tant que le serveur n'a pas répondu.
 */
export function MemoryPolicyBlock({ labels, projectId }: { labels: Labels; projectId: string }) {
  const [policy, setPolicy] = useState<MemoryPolicyOut | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePolicyOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const projectSelectId = useId();
  const floorSelectId = useId();

  useEffect(() => {
    let live = true;
    void Promise.all([fetchProjectPolicy(projectId), fetchWorkspacePolicy()]).then(([project, space]) => {
      if (!live) return;
      setPolicy(project);
      setWorkspace(space);
    });
    return () => {
      live = false;
    };
  }, [projectId]);

  if (!policy) return null;
  const names = labels.memoryPolicy as Record<string, string>;
  const name = (value: string) => names[value] ?? value;

  const changeProject = async (value: string) => {
    if (!isPolicy(value)) return;
    setBusy(true);
    setFailed(false);
    const updated = await setProjectPolicy(projectId, value);
    if (updated) setPolicy(updated);
    else setFailed(true);
    setBusy(false);
  };

  const changeFloor = async (value: string) => {
    if (!isPolicy(value)) return;
    setBusy(true);
    setFailed(false);
    const updated = await setWorkspacePolicy(value);
    if (updated) {
      setWorkspace(updated);
      setPolicy(await fetchProjectPolicy(projectId)); // la valeur appliquée a pu changer
    } else setFailed(true);
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-meta text-ink-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={projectSelectId} className="font-medium text-ink">
          {labels.memoryPolicyTitle}
        </label>
        {policy.can_set ? (
          <select id={projectSelectId} value={policy.policy} disabled={busy} onChange={(event) => void changeProject(event.target.value)} className={selectClass}>
            {POLICIES.map((option: MemoryPolicy) => (
              <option key={option} value={option} disabled={!isAllowed(option, policy.floor)}>
                {name(option)}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-ink">{name(policy.policy)}</span>
        )}
      </div>
      <p className="text-ink-3 text-pretty">{(labels.memoryPolicyHint as Record<string, string>)[policy.effective] ?? ""}</p>
      {policy.effective !== policy.policy && (
        <p className="text-ink-3 text-pretty">{labels.memoryPolicyFloorNote.replace("{policy}", name(policy.floor))}</p>
      )}
      {workspace?.can_set && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <label htmlFor={floorSelectId} className="font-medium text-ink" title={labels.memoryFloorHint}>
            {labels.memoryFloorTitle}
          </label>
          <select id={floorSelectId} value={workspace.floor} disabled={busy} onChange={(event) => void changeFloor(event.target.value)} className={selectClass}>
            {POLICIES.map((option) => (
              <option key={option} value={option}>
                {name(option)}
              </option>
            ))}
          </select>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-danger">
          {labels.memoryPolicyError}
        </p>
      )}
    </div>
  );
}
