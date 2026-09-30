import { parseBackendDate, type ConversationOut, type ProjectOut } from "./workspace-types";

/** Extrait de components/workspace/sidebar.tsx : logique pure de regroupement,
 * séparée pour être testable sans monter le composant (next/navigation,
 * workspace-provider, etc.). Aucune dépendance React/Next ici. */

export type DateKey = "today" | "yesterday" | "week" | "earlier";
export const DATE_KEYS: DateKey[] = ["today", "yesterday", "week", "earlier"];

export type Group = { key: string; label: string; items: ConversationOut[] };

type DateLabels = Record<DateKey, string>;

/** Découpage par date, dans l'ordre de la barre latérale. */
export function groupByDate(conversations: ConversationOut[], labels: DateLabels): Group[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const day = 86_400_000;
  const buckets: Record<DateKey, ConversationOut[]> = { today: [], yesterday: [], week: [], earlier: [] };
  for (const conversation of conversations) {
    const at = parseBackendDate(conversation.created_at) ?? 0;
    const key: DateKey = at >= today ? "today" : at >= today - day ? "yesterday" : at >= today - 7 * day ? "week" : "earlier";
    buckets[key].push(conversation);
  }
  return DATE_KEYS.filter((key) => buckets[key].length).map((key) => ({ key, label: labels[key], items: buckets[key] }));
}

/** Clé interne des conversations sans projet (aucun id ne peut valoir cette valeur). */
export const NO_PROJECT = "__none__";

/** Découpage par projet : rend visible à quelles conversations un projet
 * appartient, et isole celles qui n'en dépendent pas. L'ordre suit la barre
 * latérale (projets creation), pas l'ordre alphabétique. */
export function groupByProject(conversations: ConversationOut[], projects: ProjectOut[], noProjectLabel: string): Group[] {
  const known = new Set(projects.map((project) => project.id));
  const byProject = new Map<string, ConversationOut[]>();
  const orphans: ConversationOut[] = [];
  for (const conversation of conversations) {
    const id = conversation.project_id;
    if (id && known.has(id)) byProject.set(id, [...(byProject.get(id) ?? []), conversation]);
    else orphans.push(conversation);
  }
  const groups: Group[] = projects
    .filter((project) => byProject.get(project.id)?.length)
    .map((project) => ({ key: project.id, label: project.name, items: byProject.get(project.id) ?? [] }));
  if (orphans.length) groups.push({ key: NO_PROJECT, label: noProjectLabel, items: orphans });
  return groups;
}
