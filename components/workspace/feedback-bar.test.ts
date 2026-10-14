// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import * as feedbackLib from "@/lib/feedback";
import { FeedbackBar } from "./feedback-bar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

const labels = {
  feedbackGood: fr.workspace.chat.feedbackGood,
  feedbackBad: fr.workspace.chat.feedbackBad,
  feedbackReasonLabel: fr.workspace.chat.feedbackReasonLabel,
  feedbackReasonPlaceholder: fr.workspace.chat.feedbackReasonPlaceholder,
  feedbackSend: fr.workspace.chat.feedbackSend,
  feedbackSkip: fr.workspace.chat.feedbackSkip,
  feedbackThanks: fr.workspace.chat.feedbackThanks,
  feedbackError: fr.workspace.chat.feedbackError,
};

async function mount(props: Partial<Parameters<typeof FeedbackBar>[0]> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(FeedbackBar, {
        messageId: "msg_123",
        value: null,
        labels,
        onChange: vi.fn(),
        ...props,
      })
    );
  });
}

async function updateProps(props: Partial<Parameters<typeof FeedbackBar>[0]>) {
  await act(async () => {
    root.render(
      createElement(FeedbackBar, {
        messageId: "msg_123",
        value: null,
        labels,
        onChange: vi.fn(),
        ...props,
      })
    );
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("FeedbackBar", () => {
  it("affiche les boutons avec les attributs aria-label et role='status' pour le message", async () => {
    await mount();

    const buttons = host.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute("aria-label")).toBe(labels.feedbackGood);
    expect(buttons[1].getAttribute("aria-label")).toBe(labels.feedbackBad);

    const statusEl = host.querySelector("[role='status']");
    expect(statusEl).not.toBeNull();
    expect(statusEl?.getAttribute("aria-live")).toBe("polite");
  });

  it("cliquer sur pouce vers le haut envoie le feedback et met à jour l'état", async () => {
    const onChange = vi.fn();
    vi.spyOn(feedbackLib, "sendFeedback").mockResolvedValue(true);

    await mount({ onChange });

    const buttons = host.querySelectorAll("button");
    await act(async () => {
      buttons[0].click();
    });

    expect(onChange).toHaveBeenCalledWith("up");
    expect(feedbackLib.sendFeedback).toHaveBeenCalledWith("msg_123", "up");
  });

  it("cliquer sur pouce vers le bas déclenche onChange et affiche le formulaire de motif quand value vaut 'down'", async () => {
    const onChange = vi.fn();
    vi.spyOn(feedbackLib, "sendFeedback").mockResolvedValue(true);

    await mount({ onChange, value: null });

    const buttons = host.querySelectorAll("button");
    await act(async () => {
      buttons[1].click();
    });

    expect(onChange).toHaveBeenCalledWith("down");

    // Simulate parent state update passing value="down"
    await updateProps({ onChange, value: "down" });

    expect(host.querySelector("form")).not.toBeNull();
    expect(host.textContent).toContain(labels.feedbackReasonLabel);
  });

  it("soumettre le motif enregistre la raison et montre le message de remerciement", async () => {
    vi.spyOn(feedbackLib, "sendFeedback").mockResolvedValue(true);

    let currentValue: feedbackLib.Feedback | null = null;
    const onChange = (v: feedbackLib.Feedback | null) => {
      currentValue = v;
    };

    await mount({ value: currentValue, onChange });

    const buttons = host.querySelectorAll("button");
    await act(async () => {
      buttons[1].click();
    });

    // Re-render with updated value from parent
    await updateProps({ value: currentValue, onChange });

    const textarea = host.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea).not.toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      valueSetter?.call(textarea, "Incomplet");
      textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = host.querySelector("form");
    await act(async () => {
      form!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });

    expect(feedbackLib.sendFeedback).toHaveBeenLastCalledWith("msg_123", "down", "Incomplet");
    const statusEl = host.querySelector("[role='status']");
    expect(statusEl?.textContent).toBe(labels.feedbackThanks);
  });
});
