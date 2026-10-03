"use client";

import type { Dictionary } from "@/app/[lang]/dictionaries";
import { formatSize } from "@/lib/drive";
import type { EmailAttachmentOut } from "@/lib/workspace-types";
import { FileLink } from "./file-viewer";
import { PaperclipIcon } from "./icons";

type Chat = Dictionary["workspace"]["chat"];

/**
 * Pièces jointes d'un email en attente d'approbation — la liste RÉELLE côté serveur (ce qui partira),
 * pas ce que le modèle a annoncé. Tant que l'email attend, chaque fichier s'ouvre dans l'aperçu pour
 * vérifier ce qui est envoyé avant d'approuver.
 */
export function EmailAttachmentList({
  actionId,
  attachments,
  openable,
  labels,
}: {
  actionId: string;
  attachments: EmailAttachmentOut[];
  /** Aperçu possible (action encore en attente : les copies existent). */
  openable: boolean;
  labels: Chat;
}) {
  if (!attachments.length) return null;
  return (
    <div className="mt-3">
      <p className="text-meta text-ink-3">{labels.emailAttachments.replace("{n}", String(attachments.length))}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {attachments.map((file, index) => {
          const content = (
            <>
              <PaperclipIcon size={14} className="shrink-0 text-bordeaux-700" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              {file.source === "drive" && <span className="shrink-0 rounded-badge bg-surface px-1.5 text-meta text-ink-3">{labels.emailAttachmentDrive}</span>}
              <span className="shrink-0 text-meta text-ink-3 tabular-nums">{formatSize(file.size)}</span>
            </>
          );
          const row = "flex items-center gap-2 rounded-badge border border-border bg-white px-2.5 py-1.5 text-secondary text-ink";
          return (
            <li key={`${file.name}-${index}`}>
              {openable ? (
                <FileLink
                  url={`/api/donna/chat/memory/actions/${encodeURIComponent(actionId)}/attachments/${index}/file`}
                  name={file.name}
                  className={`${row} no-underline hover:border-bordeaux-700/30`}
                >
                  {content}
                </FileLink>
              ) : (
                <div className={row}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
