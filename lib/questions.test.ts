import { describe, expect, it } from "vitest";
import { answerPreview, cardOf, hasAnything, NO, YES } from "./questions";
import type { ToolCall } from "./workspace-types";

const call = (args: Record<string, unknown>, name = "ask_user"): ToolCall => ({ name, arguments: args, result: "" });

const LABELS = { yes: "Oui", no: "Non", note: "Précision" };

describe("cardOf", () => {
  it("relit une carte à plusieurs questions typées", () => {
    const card = cardOf(call({
      questions: [
        { id: "q1", question: "Format ?", type: "single", options: ["PDF", "Word"] },
        { id: "q2", question: "Sections ?", type: "multi", options: ["Expérience"] },
        { id: "q3", question: "On y va ?", type: "yes_no" },
      ],
      allow_free_text: false,
    }));
    expect(card?.questions.map((q) => q.type)).toEqual(["single", "multi", "yes_no"]);
    expect(card?.questions[2].options).toEqual([]); // oui/non : libellés de l'interface
    expect(card?.allowFreeText).toBe(false);
  });

  // Des cartes de l'ancienne forme sont déjà enregistrées : elles doivent rester dessinables.
  it("relit une carte de l'ancienne forme, et lui donne la même numérotation que le serveur", () => {
    const card = cardOf(call({ question: "Lequel ?", options: ["A", "B"] }));
    expect(card?.questions).toEqual([{ id: "q1", question: "Lequel ?", type: "single", options: ["A", "B"] }]);
    expect(card?.allowFreeText).toBe(true); // champ libre ouvert par défaut
  });

  it("déduit un type manquant ou inconnu plutôt que de perdre la question", () => {
    const card = cardOf(call({ questions: [
      { question: "Avec options", options: ["a"] },
      { question: "Sans option" },
      { question: "Type inventé", type: "slider", options: ["a"] },
      { question: "Choix sans option", type: "multi", options: [] },
    ] }));
    expect(card?.questions.map((q) => q.type)).toEqual(["single", "yes_no", "single", "yes_no"]);
  });

  it("ne rend rien quand il n'y a rien à dessiner", () => {
    expect(cardOf(undefined)).toBeNull();
    expect(cardOf(call({ question: "x" }, "search_documents"))).toBeNull();
    expect(cardOf(call({ question: "   " }))).toBeNull();
    expect(cardOf(call({ questions: [{ question: "" }] }))).toBeNull();
  });
});

describe("hasAnything", () => {
  it("une seule réponse, ou une précision seule, suffisent", () => {
    expect(hasAnything({}, "")).toBe(false);
    expect(hasAnything({ q1: [] }, "   ")).toBe(false);
    expect(hasAnything({ q1: ["PDF"] }, "")).toBe(true);
    expect(hasAnything({}, "plutôt court")).toBe(true);
  });
});

describe("answerPreview", () => {
  const card = cardOf(call({ questions: [
    { id: "q1", question: "Format ?", type: "single", options: ["PDF"] },
    { id: "q2", question: "Sections ?", type: "multi", options: ["Expérience", "Projets"] },
    { id: "q3", question: "On y va ?", type: "yes_no" },
  ] }))!;

  it("écrit les réponses comme un message", () => {
    expect(answerPreview(card, { q1: ["PDF"], q2: ["Expérience", "Projets"], q3: [YES] }, " une page ", LABELS)).toBe(
      "Format ? → PDF\nSections ? → Expérience, Projets\nOn y va ? → Oui\nPrécision : une page",
    );
  });

  it("traduit oui/non et n'invente pas les questions sans réponse", () => {
    expect(answerPreview(card, { q3: [NO] }, "", LABELS)).toBe("On y va ? → Non");
    expect(answerPreview(card, { q3: [YES] }, "", { ...LABELS, yes: "Yes" })).toBe("On y va ? → Yes");
  });

  it("une précision seule est un message valable", () => {
    expect(answerPreview(card, {}, "j'en parle de vive voix", LABELS)).toBe("Précision : j'en parle de vive voix");
  });
});
