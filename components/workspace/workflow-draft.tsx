"use client";

import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { WorkflowDraftOut } from "@/lib/workspace-types";
import { WorkflowAgents, WorkflowStepList } from "./workflow-agents";

type Chat = Dictionary["workspace"]["chat"];
type AgentLabels = Dictionary["workspace"]["workflowAgents"];

/**
 * Automatisation proposée par DONNA, telle que le serveur va l'activer : le déclencheur puis chaque étape.
 * C'est ce que l'utilisateur approuve — la liste vient du serveur, pas de ce que le modèle a annoncé.
 */
export function WorkflowDraft({ draft, labels, agentLabels }: { draft: WorkflowDraftOut; labels: Chat; agentLabels: AgentLabels }) {
  const [trigger, ...steps] = draft.lines;
  return (
    <div className="mt-3">
      <p className="text-label font-medium text-ink">{draft.name}</p>
      {trigger && <p className="mt-0.5 text-secondary text-brand">{trigger}</p>}
      <WorkflowStepList steps={steps} />
      <WorkflowAgents refs={draft.agent_refs ?? []} labels={agentLabels} />
      <p className="mt-2 text-meta text-ink-3 text-pretty">{labels.workflowNote}</p>
    </div>
  );
}
