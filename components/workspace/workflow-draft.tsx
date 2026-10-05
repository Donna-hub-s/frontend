"use client";

import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { WorkflowDraftOut } from "@/lib/workspace-types";
import { WorkflowAgents } from "./workflow-agents";

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
      {trigger && <p className="mt-0.5 text-secondary text-bordeaux-700">{trigger}</p>}
      {steps.length > 0 && (
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-secondary leading-5 text-ink-2 marker:text-ink-3">
          {steps.map((line, index) => (
            <li key={index} className="text-pretty">
              {line}
            </li>
          ))}
        </ol>
      )}
      <WorkflowAgents refs={draft.agent_refs ?? []} labels={agentLabels} />
      <p className="mt-2 text-meta text-ink-3 text-pretty">{labels.workflowNote}</p>
    </div>
  );
}
