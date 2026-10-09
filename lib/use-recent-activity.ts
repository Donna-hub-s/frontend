"use client";

import { useEffect, useRef, useState } from "react";
import { hasLiveWork, POLL_MS, recentActivity, type ActivityItem, type ResearchSummary, type WorkflowRunSummary } from "./activity";

/** Passerelle `/api/donna/…` vers `GET /app/workflows/runs` et `GET /app/chat/research` (tenant et utilisateur viennent du jeton). */
export const WORKFLOW_RUNS_URL = "/api/donna/workflows/runs?limit=10";
export const RESEARCH_URL = "/api/donna/chat/research?limit=10";

type Lists = { workflows: WorkflowRunSummary[]; research: ResearchSummary[] };

/** La liste, ou null si la source ne répond pas (réseau, 4xx/5xx, réponse inattendue) : l'appelant garde alors sa dernière liste connue. */
async function fetchList<T>(url: string): Promise<T[] | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return Array.isArray(body) ? (body as T[]) : null;
  } catch {
    return null;
  }
}

/**
 * Les travaux récents de DONNA (voir lib/activity.ts), ou null avant la première réponse.
 *
 * - Relu quand `refreshKey` change : l'accueil le fait varier à l'arrivée d'une notification (une automatisation vient de finir).
 * - Relu toutes les `POLL_MS` TANT QU'un travail tourne, puis plus : sur un écran au repos, aucune requête.
 * - Une source en panne ne vide jamais l'autre ni la liste déjà affichée ; l'accueil ne doit pas se casser pour une section secondaire.
 */
export function useRecentActivity(refreshKey: string): ActivityItem[] | null {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const known = useRef<Lists>({ workflows: [], research: [] });

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      const [workflows, research] = await Promise.all([fetchList<WorkflowRunSummary>(WORKFLOW_RUNS_URL), fetchList<ResearchSummary>(RESEARCH_URL)]);
      if (!live) return;
      known.current = { workflows: workflows ?? known.current.workflows, research: research ?? known.current.research };
      const now = Date.now();
      const next = recentActivity(known.current.workflows, known.current.research, now);
      setItems(next);
      if (hasLiveWork(next, now)) timer = setTimeout(() => void load(), POLL_MS);
    };

    void load();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
    // `refreshKey` ne sert à rien dans le corps : c'est lui qui relance l'effet.
  }, [refreshKey]);

  return items;
}
