// Invitations de projet — voir backend/app/chat/src/routes/project_routes.py et project_access.py. Un projet appartient à un espace : on n'y invite
// que quelqu'un de l'espace (ou, pour le responsable de l'espace, on l'invite à l'espace en même temps). Ici : de quoi présenter les réponses du serveur.

export type SpaceStatus = "member" | "space_invite_pending" | "not_member" | "unknown";

/** Clé de libellé de l'état d'une personne invitée vis-à-vis de l'espace ; toute valeur inconnue est présentée comme « inconnue », jamais comme « membre ». */
export function spaceStatusKey(status: string | null | undefined): SpaceStatus {
  return status === "member" || status === "space_invite_pending" || status === "not_member" ? status : "unknown";
}

export type InviteErrorKind = "invalid" | "outsideSpace" | "spaceInvite" | "directory" | "generic";

/** Pourquoi le serveur a refusé une invitation (le texte exact est celui du dictionnaire, pas celui du serveur). */
export function inviteErrorKind(status: number): InviteErrorKind {
  if (status === 400) return "invalid";
  if (status === 403) return "outsideSpace";
  if (status === 502) return "spaceInvite";
  if (status === 503) return "directory";
  return "generic";
}

/** Lien d'une invitation de projet / d'espace, tel que l'ouvre la personne invitée. */
export const projectInviteLink = (origin: string, token: string): string => `${origin}/projects/invites/${token}`;
export const spaceInviteLink = (origin: string, token: string): string => `${origin}/invitation?token=${encodeURIComponent(token)}`;

/** Aperçu des projets de l'espace (backend/app/chat/src/schemas.py::WorkspaceProjectOut). */
export type WorkspaceProject = {
  id: string;
  name: string;
  member_count: number;
  owner_count: number;
  owners: string[];
  my_role: string | null;
  created_at: string;
};

export const WORKSPACE_PROJECTS_URL = "/api/donna/chat/workspace/projects";
export const claimOwnershipUrl = (projectId: string) => `/api/donna/chat/projects/${encodeURIComponent(projectId)}/claim-ownership`;

/** Un projet que le responsable de l'espace peut reprendre : il n'a plus aucun propriétaire. */
export const isOrphan = (project: WorkspaceProject): boolean => project.owner_count === 0;
