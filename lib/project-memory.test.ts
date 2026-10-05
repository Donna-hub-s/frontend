import { describe, expect, it } from "vitest";
import { authorName, canSave, deletePath, historyPath, isConflict, lastChange } from "./project-memory";

const labels = { you: "vous", unknown: "Membre" };
const members = [
  { user_id: "u1", email: "alice@exemple.test" },
  { user_id: "u2", email: null },
];

describe("authorName", () => {
  it("dit « vous » pour soi, l'email pour un autre membre", () => {
    expect(authorName("u1", members, "u1", labels)).toBe("vous");
    expect(authorName("u1", members, "u9", labels)).toBe("alice@exemple.test");
  });

  it("n'invente jamais de nom : un membre parti ou sans email reste « Membre »", () => {
    expect(authorName("parti", members, "u1", labels)).toBe("Membre");
    expect(authorName("u2", members, "u1", labels)).toBe("Membre");
    expect(authorName(null, members, "u1", labels)).toBe("Membre");
    expect(authorName(undefined, members, "u1", labels)).toBe("Membre");
  });
});

describe("lastChange", () => {
  it("un fait jamais modifié montre sa création", () => {
    expect(lastChange({ created_by: "u1", created_at: "2026-10-01T10:00:00Z" })).toEqual({ by: "u1", at: "2026-10-01T10:00:00Z", edited: false, version: 1 });
    expect(lastChange({ created_by: "u1", created_at: "2026-10-01T10:00:00Z", updated_by: null, updated_at: null, version: 1 }).edited).toBe(false);
  });

  it("un fait modifié montre son dernier auteur, pas celui d'origine", () => {
    const change = lastChange({ created_by: "u1", created_at: "2026-10-01T10:00:00Z", updated_by: "u2", updated_at: "2026-10-03T09:00:00Z", version: 3 });
    expect(change).toEqual({ by: "u2", at: "2026-10-03T09:00:00Z", edited: true, version: 3 });
  });

  it("un auteur sans date (ou l'inverse) ne compte pas comme une modification", () => {
    expect(lastChange({ created_by: "u1", created_at: "t0", updated_by: "u2", updated_at: null }).edited).toBe(false);
    expect(lastChange({ created_by: "u1", created_at: "t0", updated_by: null, updated_at: "t1" }).edited).toBe(false);
  });
});

describe("isConflict", () => {
  it("seul le 409 demande de recharger", () => {
    expect(isConflict(409)).toBe(true);
    for (const status of [0, 200, 400, 403, 404, 500]) expect(isConflict(status)).toBe(false);
  });
});

describe("canSave", () => {
  it("n'enregistre que ce qui change, jamais du vide, jamais pendant un envoi", () => {
    expect(canSave("nouveau", "ancien")).toBe(true);
    expect(canSave("  ancien  ", "ancien")).toBe(false);
    expect(canSave("   ", "ancien")).toBe(false);
    expect(canSave("nouveau", "ancien", true)).toBe(false);
  });
});

describe("chemins", () => {
  it("encode les identifiants et annonce la version vue à la suppression", () => {
    expect(historyPath("p 1")).toBe("/p%201/memory/history");
    expect(historyPath("p1", "f/1")).toBe("/p1/memory/history?fact_id=f%2F1");
    expect(historyPath("p1", null)).toBe("/p1/memory/history");
    expect(deletePath("p1", "f 1", 3)).toBe("/p1/memory/facts/f%201?expected_version=3");
  });
});
