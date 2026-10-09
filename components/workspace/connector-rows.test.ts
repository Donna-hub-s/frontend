// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import type { ConnectorsOut } from "@/lib/api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// La page courante : c'est là que la liaison doit ramener l'utilisateur.
vi.mock("next/navigation", () => ({ usePathname: () => "/fr/app/c/abc-123", useRouter: () => ({ push: () => {} }) }));

import { ConnectorRows } from "./side-panel";

const connectors = (google: Partial<ConnectorsOut["google"]>): ConnectorsOut => ({
  google: { connected: true, gmail: false, calendar: false, drive: false, detail: "", ...google },
  whatsapp: { enabled: false, available: false, paired: false, online: false },
  llm_provider: "ollama",
});

let host: HTMLElement;
let root: Root;
const render = (value: ConnectorsOut) =>
  act(async () => {
    root.render(createElement(ConnectorRows, { lang: "fr", dict: fr.workspace as never, connectors: value }));
  });
const rows = () => [...host.querySelectorAll("li")];
const link = (row: HTMLElement) => row.querySelector("a");
const params = (row: HTMLElement) => new URL(link(row)!.getAttribute("href")!, "http://x").searchParams;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ConnectorRows — Google, un service à la fois", () => {
  it("chaque ligne non reliée a SON lien, qui ne demande que son service", async () => {
    await render(connectors({ gmail: true }));
    const [gmail, calendar, drive] = rows();
    expect(link(gmail)).toBeNull(); // déjà reliée : un état, pas un bouton
    expect(params(calendar).get("services")).toBe("calendar");
    expect(params(drive).get("services")).toBe("drive");
  });

  it("ramène sur la page d'où l'on vient, pas sur une conversation vide", async () => {
    await render(connectors({}));
    for (const row of rows()) expect(params(row).get("next")).toBe("/fr/app/c/abc-123");
  });

  it("garde le mode « liaison » et la langue", async () => {
    await render(connectors({}));
    expect([params(rows()[0]).get("link"), params(rows()[0]).get("lang")]).toEqual(["1", "fr"]);
    expect(new URL(link(rows()[0])!.getAttribute("href")!, "http://x").pathname).toBe("/oauth/google");
  });

  it("Google relié mais un accès manquant : « Autoriser » ; Google non relié : « Connecter »", async () => {
    await render(connectors({ connected: true, gmail: true }));
    expect(link(rows()[1])!.textContent).toBe(fr.workspace.panel.authorize);
    await render(connectors({ connected: false }));
    expect(rows().map((row) => link(row)!.textContent)).toEqual(Array(3).fill(fr.workspace.panel.connect));
  });

  it("les trois liens ont des noms accessibles distincts (« Autoriser » seul ne dit pas quoi)", async () => {
    await render(connectors({}));
    const names = rows().map((row) => link(row)!.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(3);
    expect(names[1]).toContain(fr.workspace.panel.googleCalendar);
  });

  it("trois services, trois adresses différentes", async () => {
    await render(connectors({}));
    expect(new Set(rows().map((row) => link(row)!.getAttribute("href"))).size).toBe(3);
  });
});
