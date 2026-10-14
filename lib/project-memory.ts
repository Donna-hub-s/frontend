/** Mémoire de projet : qui a écrit un fait, quand, et ce que dit son historique — de la logique pure, testée (project-memory.test.ts).
 *  Le serveur fait foi (droits, versions, plafonds) ; ces fonctions ne font qu'afficher ce qu'il renvoie. */

export type FactAction = "create" | "update" | "delete";

export type FactVersion = {
  fact_id: string;
  version: number;
  action: FactAction;
  fact: string;
  changed_by: string;
  changed_at: string;
  /** Texte d'un fait oublié : seul le propriétaire du projet le lit (le serveur le vide pour les autres). */
  redacted?: boolean;
  /** Texte effacé par la politique de rétention : la trace (qui, quand) reste, le contenu non. */
  purged?: boolean;
  /** « donna » : retenu, corrigé ou oublié par DONNA au nom de `changed_by` ; « user » (ou absent) : écrit à la main. */
  via?: string;
};

/** Écriture dans la mémoire d'un projet proposée par DONNA (action « project_fact ») — backend/app/chat/src/schemas.py::ProjectFactProposalOut. */
export type ProjectFactProposal = {
  op: "create" | "update" | "delete" | string;
  project_id: string;
  project_name: string;
  fact: string;
  previous: string | null;
};

type Person = { user_id: string; email: string | null };
type Stamped = { created_by: string; created_at: string; version?: number; updated_by?: string | null; updated_at?: string | null };

/** Qui a écrit : « vous », l'email du membre, ou un libellé neutre si la personne a quitté le projet — on n'invente jamais un nom. */
export function authorName(userId: string | null | undefined, members: Person[], currentUserId: string, labels: { you: string; unknown: string }): string {
  if (!userId) return labels.unknown;
  if (userId === currentUserId) return labels.you;
  return members.find((member) => member.user_id === userId)?.email ?? labels.unknown;
}

/** Dernier mouvement d'un fait : sa dernière modification si elle existe, sinon sa création. */
export function lastChange(fact: Stamped): { by: string; at: string; edited: boolean; version: number } {
  const edited = Boolean(fact.updated_by && fact.updated_at);
  return {
    by: edited ? (fact.updated_by as string) : fact.created_by,
    at: edited ? (fact.updated_at as string) : fact.created_at,
    edited,
    version: fact.version ?? 1,
  };
}

/** Le serveur refuse (409) une écriture fondée sur une version qui n'est plus la courante : on recharge, on ne réessaie pas à l'aveugle. */
export const isConflict = (status: number): boolean => status === 409;

/** On ne propose d'enregistrer que ce qui change vraiment (le serveur n'écrit d'ailleurs pas de version vide). */
export const canSave = (draft: string, current: string, busy = false): boolean => {
  const next = draft.trim();
  return !busy && next.length > 0 && next !== current.trim();
};

/** Chemin de lecture de l'historique : tout le projet, ou un seul fait (supprimé ou non). */
export const historyPath = (projectId: string, factId?: string | null): string =>
  `/${encodeURIComponent(projectId)}/memory/history${factId ? `?fact_id=${encodeURIComponent(factId)}` : ""}`;

/** Chemin de suppression : annonce la version vue, pour qu'un fait modifié entre-temps ne soit pas oublié sans que l'auteur le sache. */
export const deletePath = (projectId: string, factId: string, version: number): string =>
  `/${encodeURIComponent(projectId)}/memory/facts/${encodeURIComponent(factId)}?expected_version=${version}`;
