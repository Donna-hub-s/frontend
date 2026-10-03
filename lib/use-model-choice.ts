"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { MODEL_CHOICE_EVENT, readRawChoice } from "./model-choice";
import { parseChoice, type ModelChoice } from "./models";
import type { ModelsOut } from "./workspace-types";

const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(MODEL_CHOICE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(MODEL_CHOICE_EVENT, notify);
  };
};

/** Choix de modèle courant (mémorisé dans le navigateur) ; null côté serveur et tant que rien n'est choisi. */
export function useModelChoice(): ModelChoice | null {
  const raw = useSyncExternalStore(subscribe, readRawChoice, () => null);
  return useMemo(() => parseChoice(raw), [raw]);
}

// Liste des modèles du serveur : une seule lecture par chargement de page, partagée par tous les composers.
let cached: ModelsOut | null = null;

export function useModels(): ModelsOut | null {
  const [data, setData] = useState<ModelsOut | null>(cached);
  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    void fetch("/api/donna/chat/models", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<ModelsOut>) : null))
      .then((value) => {
        if (!value) return;
        cached = value;
        if (!cancelled) setData(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}
