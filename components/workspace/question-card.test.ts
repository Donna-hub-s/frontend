// @vitest-environment jsdom
// La carte de questions (`ask_user`) : plusieurs questions typées répondues ENSEMBLE, puis relues
// telles qu'elles ont été cochées. C'est ce dernier point qui manquait — après un rechargement, la
// carte réapparaissait vierge au-dessus de sa propre réponse.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import type { ChatMessage, QuestionAnswersOut, ToolCall } from "@/lib/workspace-types";
import { AssistantMessage } from "./conversation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const CARD: ToolCall = {
  name: "ask_user",
  arguments: {
    questions: [
      { id: "q1", question: "Quel format ?", type: "single", options: ["PDF", "Word"] },
      { id: "q2", question: "Quelles sections ?", type: "multi", options: ["Expérience", "Projets"] },
      { id: "q3", question: "On y va ?", type: "yes_no" },
    ],
    allow_free_text: true,
  },
  result: "",
};

const noop = () => {};

const mount = (options: { card?: ToolCall; answered?: QuestionAnswersOut; last?: boolean; content?: string } = {}, onAnswerCard = vi.fn().mockResolvedValue(true)) => {
  const message: ChatMessage = {
    id: "m1", role: "assistant", content: options.content ?? "J'ai besoin de précisions.", serverId: "srv-1",
    createdAt: Date.now(), attachments: [], steps: [], tools: [options.card ?? CARD], status: "done",
  };
  act(() => {
    root.render(
      createElement(AssistantMessage, {
        lang: "fr",
        dict: fr.workspace,
        message,
        last: options.last ?? true,
        busy: false,
        conversationId: "c1",
        answered: options.answered,
        onAnswerCard,
        onRetry: noop,
        onFeedback: noop,
        onRegenerate: async () => false,
        onSelectVersion: async () => false,
      }),
    );
  });
  return onAnswerCard;
};

const buttons = () => [...host.querySelectorAll("button")];
const byLabel = (text: string) => buttons().find((b) => b.textContent?.trim() === text);
/** `async` : l'envoi attend une promesse, dont la résolution remet l'état `busy` — sans la laisser
 * s'écouler DANS act(), React signale une mise à jour hors act. */
const click = async (element: Element | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};
const sendButton = () => byLabel(fr.workspace.chat.questionSend);

describe("carte de questions — saisie", () => {
  it("dessine les trois questions, avec Oui/Non fournis par l'interface", async () => {
    mount();
    expect(host.textContent).toContain("Quel format ?");
    expect(host.textContent).toContain("Quelles sections ?");
    expect(byLabel(fr.workspace.chat.questionYes)).toBeTruthy();
    expect(byLabel(fr.workspace.chat.questionNo)).toBeTruthy();
  });

  it("n'envoie rien tant que rien n'est choisi — une carte n'oblige à rien, un message vide n'a pas de sens", async () => {
    mount();
    expect(sendButton()?.disabled).toBe(true);
    await click(byLabel("PDF"));
    expect(sendButton()?.disabled).toBe(false);
  });

  it("un choix unique remplace le précédent ; recliquer le retire", async () => {
    mount();
    await click(byLabel("PDF"));
    expect(byLabel("PDF")?.getAttribute("aria-pressed")).toBe("true");
    await click(byLabel("Word"));
    expect(byLabel("PDF")?.getAttribute("aria-pressed")).toBe("false");
    expect(byLabel("Word")?.getAttribute("aria-pressed")).toBe("true");
    await click(byLabel("Word"));
    expect(byLabel("Word")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("un choix multiple en cumule plusieurs", async () => {
    mount();
    await click(byLabel("Expérience"));
    await click(byLabel("Projets"));
    expect(byLabel("Expérience")?.getAttribute("aria-pressed")).toBe("true");
    expect(byLabel("Projets")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("envoie TOUTE la carte d'un coup, avec la précision libre", async () => {
    const onAnswerCard = mount();
    await click(byLabel("PDF"));
    await click(byLabel("Projets"));
    await click(byLabel(fr.workspace.chat.questionYes));
    const area = host.querySelector("textarea")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, "une seule page");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(sendButton());
    expect(onAnswerCard).toHaveBeenCalledTimes(1);
    const [, answers, freeText] = onAnswerCard.mock.calls[0];
    expect(answers).toEqual({ q1: ["PDF"], q2: ["Projets"], q3: ["yes"] });
    expect(freeText).toBe("une seule page");
  });

  it("une carte qui n'est plus la dernière reste lisible mais n'est plus répondable", async () => {
    mount({ last: false });
    expect(host.textContent).toContain("Quel format ?");
    expect(byLabel("PDF")?.disabled).toBe(true);
    expect(sendButton()?.disabled).toBe(true);
  });
});

describe("carte de questions — relecture", () => {
  const answered: QuestionAnswersOut = {
    asked_message_id: "srv-1",
    answers: { q1: ["Word"], q2: ["Expérience", "Projets"], q3: ["no"] },
    free_text: "sans photo",
  };

  it("remontre ce qui a été coché, et plus aucun contrôle", async () => {
    mount({ answered });
    expect(byLabel("Word")?.getAttribute("aria-pressed")).toBe("true");
    expect(byLabel("PDF")?.getAttribute("aria-pressed")).toBe("false");
    expect(byLabel("Expérience")?.getAttribute("aria-pressed")).toBe("true");
    expect(byLabel(fr.workspace.chat.questionNo)?.getAttribute("aria-pressed")).toBe("true");
    expect(sendButton()).toBeUndefined();
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("affiche la précision écrite et se présente comme une relecture", async () => {
    mount({ answered });
    expect(host.textContent).toContain("sans photo");
    expect(host.textContent).toContain(fr.workspace.chat.questionAnswered);
    expect(host.textContent).not.toContain(fr.workspace.chat.questionLabel);
  });

  it("ne renvoie rien quand on reclique une réponse déjà donnée", async () => {
    const onAnswerCard = mount({ answered });
    await click(byLabel("PDF"));
    expect(byLabel("PDF")?.getAttribute("aria-pressed")).toBe("false");
    expect(onAnswerCard).not.toHaveBeenCalled();
  });
});

describe("carte de questions — anciennes cartes", () => {
  // L'incident d'origine : un tour où le modèle appelle `ask_user` SANS rien écrire restait muet à
  // l'écran. La carte ne dépend pas du texte de la réponse — elle se dessine quand même.
  it("une carte posée sans aucun texte reste visible", async () => {
    mount({ content: "" });
    expect(host.textContent).toContain("Quel format ?");
    expect(sendButton()).toBeTruthy();
  });

  it("une carte enregistrée à une seule question reste dessinée et répondable", async () => {
    const onAnswerCard = mount({ card: { name: "ask_user", arguments: { question: "Lequel ?", options: ["A", "B"] }, result: "" } });
    expect(host.textContent).toContain("Lequel ?");
    await click(byLabel("B"));
    await click(sendButton());
    expect(onAnswerCard.mock.calls[0][1]).toEqual({ q1: ["B"] });
  });
});
