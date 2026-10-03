"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { agentCatalogUrl, agentsUrl, type AgentCatalog, type AgentOut } from "./agents";

// Agents utilisables d'un projet (les archivés n'y sont pas) : une lecture par projet et par chargement de page, partagée par
// tous les composers et l'en-tête de la conversation ; `refreshAgents` la relit (après une modification dans le gestionnaire,
// à l'ouverture du menu) et prévient tout le monde.
const cache = new Map<string, AgentOut[]>();
const listeners = new Set<() => void>();
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

export async function refreshAgents(projectId: string): Promise<AgentOut[] | null> {
  try {
    const response = await fetch(agentsUrl(projectId), { cache: "no-store" });
    // Projet quitté ou supprimé : plus d'agents à proposer (liste vide), jamais une liste périmée.
    const agents = response.ok ? ((await response.json()) as AgentOut[]) : response.status === 404 ? [] : null;
    if (agents) {
      cache.set(projectId, agents);
      listeners.forEach((notify) => notify());
    }
    return agents;
  } catch {
    return null;
  }
}

/** Agents actifs du projet, ou null tant qu'ils ne sont pas lus (ou si aucun projet). */
export function useProjectAgents(projectId: string | null | undefined): { agents: AgentOut[] | null; refresh: () => Promise<void> } {
  const agents = useSyncExternalStore(
    subscribe,
    () => (projectId ? (cache.get(projectId) ?? null) : null),
    () => null,
  );
  useEffect(() => {
    if (projectId && !cache.has(projectId)) void refreshAgents(projectId);
  }, [projectId]);
  const refresh = useCallback(async () => {
    if (projectId) await refreshAgents(projectId);
  }, [projectId]);
  return { agents, refresh };
}

// Catalogue (modèles prêts à copier, outils autorisables) : propre à la langue, lu à la demande par le gestionnaire.
const catalogs = new Map<string, AgentCatalog>();

export function useAgentCatalog(lang: string, enabled: boolean): AgentCatalog | null {
  const [fetched, setFetched] = useState<{ lang: string; catalog: AgentCatalog } | null>(null);
  useEffect(() => {
    if (!enabled || catalogs.has(lang)) return;
    let cancelled = false;
    void fetch(agentCatalogUrl(lang), { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<AgentCatalog>) : null))
      .then((catalog) => {
        if (!catalog) return;
        catalogs.set(lang, catalog);
        if (!cancelled) setFetched({ lang, catalog });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lang, enabled]);
  return catalogs.get(lang) ?? (fetched?.lang === lang ? fetched.catalog : null);
}
