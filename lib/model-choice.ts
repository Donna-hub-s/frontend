import { parseChoice, requestFields, serializeChoice, type ModelChoice } from "./models";

/** Choix de modèle mémorisé dans le navigateur (par appareil) et envoyé avec chaque message, comme le bouton « Recherche web ». */
export const MODEL_CHOICE_KEY = "donna.model-choice";
export const MODEL_CHOICE_EVENT = "donna:model-choice";

export function readRawChoice(): string | null {
  try {
    return window.localStorage.getItem(MODEL_CHOICE_KEY);
  } catch {
    return null; // stockage indisponible (navigation privée, politique du navigateur)
  }
}

export const readModelChoice = (): ModelChoice | null => parseChoice(readRawChoice());

export function writeModelChoice(choice: ModelChoice | null): void {
  try {
    const raw = serializeChoice(choice);
    if (raw) window.localStorage.setItem(MODEL_CHOICE_KEY, raw);
    else window.localStorage.removeItem(MODEL_CHOICE_KEY);
  } catch {
    // Sans stockage, le choix ne survit pas à la page : l'envoi suivant retombe sur le modèle par défaut.
  }
  window.dispatchEvent(new Event(MODEL_CHOICE_EVENT));
}

/** Le serveur répond 400 à un modèle qui n'est plus au catalogue : on l'oublie, pour que le prochain envoi passe. */
export function clearStaleModel(status: number): void {
  if (status === 400 || status === 503) writeModelChoice(null);
}

/** Champs à ajouter à la requête de chat pour le choix courant. */
export const modelRequestFields = () => requestFields(readModelChoice());
