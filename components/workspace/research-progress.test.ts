// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import * as researchLib from "@/lib/research";
import { ResearchProgress } from "./research-progress";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

async function mount(props: Partial<Parameters<typeof ResearchProgress>[0]> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(ResearchProgress, {
        actionId: "act_123",
        lang: "fr",
        labels: fr.workspace.chat,
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

describe("ResearchProgress", () => {
  it("affiche le message initial avant le premier chargement", async () => {
    vi.spyOn(researchLib, "fetchRun").mockImplementation(() => new Promise(() => {}));
    await mount();

    expect(host.textContent).toContain(fr.workspace.chat.researchStarting);
  });

  it("affiche l'état 'en cours' avec role='status' et aria-live='polite'", async () => {
    vi.spyOn(researchLib, "fetchRun").mockResolvedValue({
      id: "run_1",
      conversation_id: "conv_123",
      question: "Sujet de recherche",
      depth: "standard",
      cap_usd: 0.5,
      estimate_usd: 0.1,
      status: "running",
      pages_read: 5,
      pages_failed: 1,
      steps: [{ at: "2025-01-01T00:00:00Z", kind: "search", label: "Recherche Google..." }],
      created_at: "2025-01-01T00:00:00Z",
      finished_at: null,
      cost_usd: null,
      report_message_id: null,
      error: null,
    });

    await mount();

    const statusEl = host.querySelector("[role='status']");
    expect(statusEl).not.toBeNull();
    expect(statusEl?.getAttribute("aria-live")).toBe("polite");
    expect(host.textContent).toContain(fr.workspace.chat.researchRunning);
    expect(host.textContent).toContain("Recherche Google...");
  });

  it("affiche l'état terminé ('done') avec le coût et le bouton de rapport", async () => {
    const onFinished = vi.fn();
    const onShowReport = vi.fn();

    vi.spyOn(researchLib, "fetchRun").mockResolvedValue({
      id: "run_1",
      conversation_id: "conv_123",
      question: "Sujet de recherche",
      depth: "standard",
      cap_usd: 0.5,
      estimate_usd: 0.1,
      status: "done",
      pages_read: 10,
      pages_failed: 0,
      steps: [],
      created_at: "2025-01-01T00:00:00Z",
      finished_at: "2025-01-01T00:01:00Z",
      cost_usd: 0.05,
      report_message_id: "msg_999",
      error: null,
    });

    await mount({ onFinished, onShowReport });

    const statusEl = host.querySelector("[role='status']");
    expect(statusEl).not.toBeNull();
    expect(statusEl?.getAttribute("aria-live")).toBe("polite");
    expect(host.textContent).toContain(fr.workspace.chat.researchDone);
    expect(onFinished).toHaveBeenCalledOnce();

    const showButton = host.querySelector("button");
    expect(showButton?.textContent?.trim()).toBe(fr.workspace.chat.researchShow);

    await act(async () => {
      showButton?.click();
    });
    expect(onShowReport).toHaveBeenCalledWith("msg_999");
  });

  it("affiche l'état annulé ('cancelled')", async () => {
    vi.spyOn(researchLib, "fetchRun").mockResolvedValue({
      id: "run_1",
      conversation_id: "conv_123",
      question: "Sujet de recherche",
      depth: "standard",
      cap_usd: 0.5,
      estimate_usd: 0.1,
      status: "cancelled",
      pages_read: 2,
      pages_failed: 0,
      steps: [],
      created_at: "2025-01-01T00:00:00Z",
      finished_at: "2025-01-01T00:00:30Z",
      cost_usd: null,
      report_message_id: null,
      error: null,
    });

    await mount();

    const statusEl = host.querySelector("[role='status']");
    expect(statusEl).not.toBeNull();
    expect(host.textContent).toContain(fr.workspace.chat.researchCancelled);
  });
});
