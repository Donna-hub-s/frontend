import { describe, expect, it } from "vitest";
import { connectorName, disabledCount, setSkill, skillChanges, skillEnabled, skillLabel } from "./skills";
import type { SkillOut } from "./workspace-types";

const memory = { id: "memory", default_enabled: true };
const beta = { id: "beta", default_enabled: false };

describe("skillEnabled", () => {
  it("prend le réglage de l'utilisateur, sinon la valeur par défaut du catalogue", () => {
    expect(skillEnabled(memory, {})).toBe(true);
    expect(skillEnabled(memory, { memory: false })).toBe(false);
    expect(skillEnabled(beta, {})).toBe(false);
    expect(skillEnabled(beta, { beta: true })).toBe(true);
  });
});

describe("disabledCount", () => {
  it("compte les skills coupées, réglage explicite ou valeur par défaut", () => {
    expect(disabledCount([memory, beta], {})).toBe(1); // « beta » est coupée par défaut
    expect(disabledCount([memory, beta], { memory: false })).toBe(2);
    expect(disabledCount([memory, beta], { beta: true })).toBe(0);
    expect(disabledCount([], { memory: false })).toBe(0);
  });
});

describe("setSkill", () => {
  it("enregistre un réglage différent de la valeur par défaut", () => {
    expect(setSkill({}, memory, false, {})).toEqual({ memory: false });
  });

  it("revenir à la valeur par défaut d'une skill jamais réglée retire l'entrée (brouillon = état initial)", () => {
    const off = setSkill({}, memory, false, {});
    expect(setSkill(off, memory, true, {})).toEqual({});
  });

  it("garde l'entrée explicite quand la skill avait déjà un réglage enregistré", () => {
    // Initialement coupée : la réactiver est un vrai changement à envoyer, pas un retour au défaut.
    expect(setSkill({ memory: false }, memory, true, { memory: false })).toEqual({ memory: true });
  });

  it("ne touche pas aux autres skills", () => {
    expect(setSkill({ drive: false }, memory, false, { drive: false })).toEqual({ drive: false, memory: false });
  });
});

describe("skillChanges", () => {
  it("n'envoie que les réglages modifiés", () => {
    expect(skillChanges({ drive: false }, { drive: false, memory: false })).toEqual({ memory: false });
    expect(skillChanges({ drive: false }, { drive: true })).toEqual({ drive: true });
    expect(skillChanges({ drive: false }, { drive: false })).toEqual({});
  });
});

describe("libellés", () => {
  const skill = { id: "x", label: { fr: "Mémoire", en: "Memory" }, description: {} } as unknown as SkillOut;

  it("suit la langue, avec repli sur l'anglais puis l'identifiant", () => {
    expect(skillLabel(skill, "fr")).toBe("Mémoire");
    expect(skillLabel(skill, "de")).toBe("Memory");
    expect(skillLabel({ ...skill, label: {} } as SkillOut, "fr")).toBe("x");
  });

  it("nomme les connecteurs, et laisse un inconnu tel quel", () => {
    expect(connectorName("calendar")).toBe("Google Calendar");
    expect(connectorName("slack")).toBe("slack");
  });
});
