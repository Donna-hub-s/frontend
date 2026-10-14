"use client";

import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { ProjectFactProposal } from "@/lib/project-memory";

type Chat = Dictionary["workspace"]["chat"];

/**
 * Écriture que DONNA propose dans la mémoire PARTAGÉE d'un projet (politique « approbation » ou « propriétaires »), telle que le serveur va
 * la faire : retenir, corriger ou oublier — avec le texte qu'elle remplace ou efface. Rien n'est écrit avant le clic de l'utilisateur.
 */
export function FactProposalDraft({ draft, labels }: { draft: ProjectFactProposal; labels: Chat }) {
  const ops = labels.factOps as Record<string, string>;
  return (
    <div className="mt-3">
      <p className="text-meta text-ink-3">{labels.factProposalInto.replace("{project}", draft.project_name)}</p>
      <p className="mt-1 text-label font-medium text-ink">
        {ops[draft.op] ?? draft.op}
        {draft.op !== "delete" && " : "}
        {draft.op !== "delete" && <span className="whitespace-pre-wrap font-normal text-ink-2">« {draft.fact} »</span>}
      </p>
      {draft.previous && (
        <p className="mt-1 text-secondary text-ink-3 text-pretty">
          {draft.op === "delete" ? labels.factProposalForgets : labels.factProposalReplaces} <span className="whitespace-pre-wrap">« {draft.previous} »</span>
        </p>
      )}
    </div>
  );
}
