/**
 * Durée d'un travail en cours.
 *
 * Les étapes n'affichaient que leur heure de DÉBUT (« 10:42:13 ») : pour savoir
 * depuis combien de temps DONNA cherchait, il fallait soustraire de tête. Rien
 * dans l'interface ne portait la durée — une étape de deux secondes et une de
 * deux minutes avaient exactement la même allure, pastille comprise.
 *
 * Volontairement muet sous quelques secondes : la plupart des étapes durent moins
 * d'une seconde, et un compteur qui s'allume puis disparaît aussitôt à chaque
 * étape ferait clignoter la liste sans rien apprendre.
 */

export type ElapsedUnits = { second: string; minute: string; hour: string };

/** En dessous, on n'affiche rien : le travail est trop court pour qu'une durée ait du sens. */
export const MIN_VISIBLE_MS = 4_000;

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Durée lisible : « 12 s », « 1 min 20 », « 25 min », « 1 h 05 ».
 * Les secondes ne sont détaillées que sous dix minutes, et les minutes sous une
 * heure : au-delà, la précision n'aide plus et fait danser les chiffres.
 */
export function formatElapsed(ms: number, units: ElapsedUnits): string {
  const total = Math.max(0, Math.floor(ms / SECOND));
  if (ms < MINUTE) return `${total} ${units.second}`;
  if (ms < HOUR) {
    const minutes = Math.floor(ms / MINUTE);
    const seconds = total % 60;
    return minutes < 10 ? `${minutes} ${units.minute} ${pad(seconds)}` : `${minutes} ${units.minute}`;
  }
  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  return `${hours} ${units.hour} ${pad(minutes)}`;
}

/** Durée à afficher pour un travail commencé à `startedAt`, ou null s'il est trop court. */
export function visibleElapsed(startedAt: number, now: number, units: ElapsedUnits): string | null {
  const ms = now - startedAt;
  return ms < MIN_VISIBLE_MS ? null : formatElapsed(ms, units);
}
