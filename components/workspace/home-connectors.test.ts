// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import type { ConnectorsOut } from "@/lib/workspace-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/navigation", () => ({ usePathname: () => "/fr/app" }));

import { ConnectorsProvider } from "./connectors-context";
import { HomeConnectors } from "./home-connectors";

const connectors = (google: Partial<ConnectorsOut["google"]>): ConnectorsOut => ({
  google: { connected: true, gmail: false, calendar: false, drive: false, detail: "", ...google },
  whatsapp: { enabled: false, available: false, paired: false, online: false },
  llm_provider: "ollama",
});

let host: HTMLElement;
let root: Root;
const render = (value: ConnectorsOut | null) =>
  act(async () => {
    root.render(createElement(ConnectorsProvider, { value }, createElement(HomeConnectors, { lang: "fr", dict: fr.workspace as never })));
  });
const rows = () => [...host.querySelectorAll("li")];
const link = (row: HTMLElement) => row.querySelector("a")!;
const params = (row: HTMLElement) => new URL(link(row).getAttribute("href")!, "http://x").searchParams;

beforeEach(() => {
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.localStorage.clear();
});

describe("HomeConnectors", () => {
  it("un compte qui vient de se connecter (Google relié, rien d'autorisé) voit les trois services, chacun avec son lien", async () => {
    await render(connectors({}));
    expect(host.querySelector("h2")?.textContent).toBe("À brancher");
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("Gmail"),
      expect.stringContaining("Google Agenda"),
      expect.stringContaining("Google Drive"),
    ]);
    expect(rows().map((row) => params(row).get("services"))).toEqual(["gmail", "calendar", "drive"]);
    expect(rows().map((row) => link(row).textContent)).toEqual(Array(3).fill(fr.workspace.panel.authorize));
  });

  it("ne montre que ce qui manque", async () => {
    await render(connectors({ gmail: true, drive: true }));
    expect(rows()).toHaveLength(1);
    expect(params(rows()[0]).get("services")).toBe("calendar");
  });

  it("Google pas encore relié : « Connecter » plutôt qu'« Autoriser »", async () => {
    await render(connectors({ connected: false }));
    expect(rows().map((row) => link(row).textContent)).toEqual(Array(3).fill(fr.workspace.panel.connect));
  });

  it("ramène sur l'accueil après l'autorisation, et reste en mode « liaison »", async () => {
    await render(connectors({}));
    expect([params(rows()[0]).get("next"), params(rows()[0]).get("link"), params(rows()[0]).get("lang")]).toEqual(["/fr/app", "1", "fr"]);
  });

  it("des noms accessibles distincts : « Autoriser » seul ne dit pas quoi", async () => {
    await render(connectors({}));
    expect(new Set(rows().map((row) => link(row).getAttribute("aria-label"))).size).toBe(3);
  });

  it("n'existe pas quand tout est autorisé : jamais de « tout est connecté »", async () => {
    await render(connectors({ gmail: true, calendar: true, drive: true }));
    expect(host.innerHTML).toBe("");
  });

  it("n'existe pas quand l'état est inconnu (l'API n'a pas répondu)", async () => {
    await render(null);
    expect(host.innerHTML).toBe("");
  });

  it("« Masquer » retire le bloc, et il reste masqué après un rechargement", async () => {
    await render(connectors({}));
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button")!.click();
    });
    expect(host.innerHTML).toBe("");
    expect(window.localStorage.getItem("donna.home.connectors.hidden")).toBe("1");

    await act(async () => root.unmount());
    root = createRoot(host);
    await render(connectors({}));
    expect(host.innerHTML).toBe("");
  });
});
