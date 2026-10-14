// Qui peut modifier la mémoire d'un projet — voir backend/app/chat/src/memory_policy.py (les niveaux, leur ordre) et routes/memory_policy_routes.py.
// Trois niveaux ordonnés du plus ouvert au plus strict ; la valeur appliquée à un projet est la plus stricte de la sienne et du plancher posé par
// le responsable de l'espace. Le serveur décide de tout (rôles, plancher) : ici, seulement de quoi présenter les choix.

export const POLICIES = ["editors", "approval", "owners"] as const;
export type MemoryPolicy = (typeof POLICIES)[number];

export type MemoryPolicyOut = { policy: string; floor: string; effective: string; can_set: boolean };
export type WorkspacePolicyOut = { floor: string; can_set: boolean };

export const isPolicy = (value: unknown): value is MemoryPolicy => typeof value === "string" && (POLICIES as readonly string[]).includes(value);

const rank = (policy: string): number => (isPolicy(policy) ? POLICIES.indexOf(policy) : POLICIES.length - 1); // illisible = le plus strict

/** Un projet ne peut pas être plus souple que le plancher de l'espace : le choix n'est offert que s'il est au moins aussi strict. */
export const isAllowed = (option: MemoryPolicy, floor: string): boolean => rank(option) >= rank(floor);

/** Le plus strict des deux, comme le serveur. */
export const stricter = (a: string, b: string): MemoryPolicy => POLICIES[Math.max(rank(a), rank(b))];

export const projectPolicyUrl = (projectId: string) => `/api/donna/chat/projects/${encodeURIComponent(projectId)}/memory/policy`;
export const WORKSPACE_POLICY_URL = "/api/donna/chat/workspace/memory-policy";

async function request<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export const fetchProjectPolicy = (projectId: string) => request<MemoryPolicyOut>(projectPolicyUrl(projectId));
export const fetchWorkspacePolicy = () => request<WorkspacePolicyOut>(WORKSPACE_POLICY_URL);
export const setProjectPolicy = (projectId: string, policy: MemoryPolicy) =>
  request<MemoryPolicyOut>(projectPolicyUrl(projectId), { method: "PUT", body: JSON.stringify({ policy }) });
export const setWorkspacePolicy = (policy: MemoryPolicy) => request<WorkspacePolicyOut>(WORKSPACE_POLICY_URL, { method: "PUT", body: JSON.stringify({ policy }) });
