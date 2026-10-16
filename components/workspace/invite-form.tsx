"use client";

// Formulaire d'invitation au projet (membres d'un espace) — extrait de
// project-detail.tsx. N'accepte jamais « propriétaire » (rôleEditor/viewer
// seulement) ; l'état de chaque invité vis-à-vis de l'espace est montré ; un
// email qui ne part pas est signalé sans cacher que l'invitation existe.

import { useId, useState } from "react";
import type { ProjectInviteOut, ProjectRole } from "@/lib/workspace-types";
import { inviteErrorKind, projectInviteLink, spaceInviteLink, spaceStatusKey, type InviteErrorKind } from "@/lib/project-invites";
import { UsersIcon } from "./icons";
import { api, fieldClass, primaryButton, roleLabel, type Labels } from "./project-shared";

export function InviteForm({ labels, projectId, initialInvites }: { labels: Labels; projectId: string; initialInvites: ProjectInviteOut[] }) {
  const [invites, setInvites] = useState(initialInvites);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<InviteErrorKind | null>(null);
  // L'invitation existe mais l'email n'est pas parti : le propriétaire doit copier le lien — jamais avalé en silence.
  const [mailNotSent, setMailNotSent] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const emailId = useId();
  const roleId = useId();

  const send = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setMailNotSent(false);
    const { ok, data, status } = await api<ProjectInviteOut>(`/${projectId}/invites`, {
      method: "POST",
      body: JSON.stringify({ email: trimmed, role }),
    });
    setBusy(false);
    if (ok && data) {
      setInvites((list) => [data, ...list]);
      setEmail("");
      setMailNotSent(data.email_sent === false);
    } else setError(inviteErrorKind(status));
  };

  const revoke = async (inviteId: string) => {
    const { ok } = await api<{ revoked: boolean }>(`/${projectId}/invites/${encodeURIComponent(inviteId)}`, { method: "DELETE" });
    if (ok) setInvites((list) => list.filter((i) => i.id !== inviteId));
  };

  const copyLink = async (invite: ProjectInviteOut, kind: "project" | "space" = "project") => {
    const token = kind === "space" ? invite.space_invite_token : invite.token;
    if (!token) return;
    try {
      await navigator.clipboard.writeText(kind === "space" ? spaceInviteLink(window.location.origin, token) : projectInviteLink(window.location.origin, token));
      const marker = `${invite.id}:${kind}`;
      setCopiedId(marker);
      window.setTimeout(() => setCopiedId((id) => (id === marker ? null : id)), 2000);
    } catch {
      // Presse-papiers indisponible (permissions navigateur) : pas bloquant.
    }
  };

  return (
    <div className="border-b border-border px-5 py-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor={emailId} className="text-label font-medium text-ink">
          {labels.inviteEmailLabel}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={emailId}
            type="email"
            required
            value={email}
            placeholder={labels.inviteEmailPlaceholder}
            onChange={(e) => setEmail(e.target.value)}
            className={`h-10 min-w-0 flex-1 basis-full sm:basis-0 ${fieldClass}`}
          />
          <label htmlFor={roleId} className="sr-only">
            {labels.inviteRoleLabel}
          </label>
          <select id={roleId} value={role} onChange={(e) => setRole(e.target.value as ProjectRole)} className="h-10 flex-1 rounded-button sm:flex-none border border-border bg-surface px-2 text-label text-ink">
            <option value="editor">{labels.roleEditor}</option>
            <option value="viewer">{labels.roleViewer}</option>
          </select>
          <button type="submit" disabled={busy || !email.trim()} className={`h-10 shrink-0 ${primaryButton} py-0`}>
            {busy ? labels.inviteSending : labels.invite}
          </button>
        </div>
        <p className="text-meta text-ink-3 text-pretty">{labels.inviteSpaceHint}</p>
        {error && (
          <p role="alert" className="text-secondary text-danger text-pretty">
            {(labels.inviteErrors as Record<string, string>)[error] ?? labels.inviteSendError}
          </p>
        )}
        {mailNotSent && (
          <p role="status" className="text-secondary text-attention text-pretty">
            {labels.inviteMailNotSent}
          </p>
        )}
      </form>

      {invites.length > 0 && (
        <div className="mt-4">
          <p className="text-meta font-medium text-ink-3">{labels.invitesPending}</p>
          <ul className="mt-1.5 flex flex-col">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-2 py-1.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-ink-3">
                  <UsersIcon size={14} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-label text-ink">{invite.email}</span>
                  <span className="text-meta text-ink-3">
                    {roleLabel(labels, invite.role)}, {labels.inviteExpiresAt.toLowerCase()} {new Date(invite.expires_at).toLocaleDateString()}
                  </span>
                  <span className={`text-meta ${spaceStatusKey(invite.space_status) === "member" ? "text-success-ink" : "text-attention"}`}>
                    {(labels.inviteSpaceStatus as Record<string, string>)[spaceStatusKey(invite.space_status)]}
                  </span>
                </span>
                {invite.token && (
                  <button type="button" onClick={() => void copyLink(invite)} className="rounded-badge px-2 py-1 text-meta font-medium text-brand hover:bg-active">
                    {copiedId === `${invite.id}:project` ? labels.inviteLinkCopied : labels.inviteCopyLink}
                  </button>
                )}
                {invite.space_invite_token && (
                  <button type="button" onClick={() => void copyLink(invite, "space")} className="rounded-badge px-2 py-1 text-meta font-medium text-brand hover:bg-active">
                    {copiedId === `${invite.id}:space` ? labels.inviteLinkCopied : labels.inviteCopySpaceLink}
                  </button>
                )}
                <button type="button" onClick={() => void revoke(invite.id)} className="rounded-badge px-2 py-1 text-meta font-medium text-ink-3 hover:bg-danger/[0.06] hover:text-danger">
                  {labels.inviteRevoke}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
