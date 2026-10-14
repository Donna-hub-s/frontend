"use client";

import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { NasLinkDraft as Draft } from "@/lib/nas";
import { FolderIcon } from "./icons";

type Chat = Dictionary["workspace"]["chat"];

/**
 * Liaison d'un dossier du NAS proposée par DONNA, telle que le serveur va la faire : le dossier, le projet, combien de documents
 * seront indexés et si le dossier restera suivi. C'est ce que l'utilisateur approuve — la liste vient du serveur, qui a résolu et
 * vérifié le chemin, pas de ce que le modèle a annoncé.
 */
export function NasLinkDraft({ draft, labels }: { draft: Draft; labels: Chat }) {
  return (
    <div className="mt-3">
      <p className="flex items-center gap-2 text-label font-medium text-ink">
        <FolderIcon size={16} className="shrink-0 text-brand" />
        <span className="min-w-0 truncate" title={draft.location}>
          {draft.location}
        </span>
      </p>
      <p className="mt-0.5 text-secondary text-brand">{labels.nasLinkInto.replace("{project}", draft.project_name)}</p>
      {draft.lines.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-secondary text-ink-2">
          {draft.lines.map((line, index) => (
            <li key={index} className="text-pretty">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
