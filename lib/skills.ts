import type { SkillOut } from "./workspace-types";

/** Réglages EXPLICITES de l'utilisateur {identifiant: activée} (profil, champ `skills`). Une skill
 * absente garde la valeur par défaut du catalogue (backend/app/chat/src/skills.py). */
export type SkillSettings = Record<string, boolean>;

type SkillRef = Pick<SkillOut, "id" | "default_enabled">;

export const skillEnabled = (skill: SkillRef, settings: SkillSettings): boolean => settings[skill.id] ?? skill.default_enabled;

/** Nombre de skills actuellement désactivées (pastille du raccourci du chat). */
export const disabledCount = (skills: SkillRef[], settings: SkillSettings): number =>
  skills.filter((skill) => !skillEnabled(skill, settings)).length;

/** Pose le réglage d'une skill. Revenir à la valeur par défaut d'une skill jamais réglée retire l'entrée :
 * rien à enregistrer, et le brouillon redevient identique à l'état initial (bouton « Enregistrer » inactif). */
export function setSkill(settings: SkillSettings, skill: SkillRef, value: boolean, initial: SkillSettings): SkillSettings {
  if (value === skill.default_enabled && !(skill.id in initial)) {
    const rest = { ...settings };
    delete rest[skill.id];
    return rest;
  }
  return { ...settings, [skill.id]: value };
}

/** Ce qu'il faut envoyer au serveur : les seuls réglages modifiés (fusionnés côté serveur, donc un autre
 * onglet qui règle une autre skill n'est pas écrasé). */
export function skillChanges(initial: SkillSettings, draft: SkillSettings): SkillSettings {
  return Object.fromEntries(Object.entries(draft).filter(([id, value]) => initial[id] !== value));
}

const text = (copy: Record<string, string>, lang: string, fallback: string) => copy[lang] ?? copy.en ?? fallback;
export const skillLabel = (skill: SkillOut, lang: string) => text(skill.label, lang, skill.id);
export const skillDescription = (skill: SkillOut, lang: string) => text(skill.description, lang, "");

const CONNECTOR_NAMES: Record<string, string> = { gmail: "Gmail", calendar: "Google Calendar", drive: "Google Drive" };
export const connectorName = (key: string) => CONNECTOR_NAMES[key] ?? key;
