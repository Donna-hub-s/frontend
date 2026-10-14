// @vitest-environment jsdom
// FileViewer s'ouvrait avant dans une fenêtre modale (<dialog>) qui recouvrait tout l'écran —
// désormais un volet docké (le Sheet partagé avec le canvas), jamais un <dialog>.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import { FileViewer } from "./file-viewer";
import { useWorkspace, WorkspaceProvider } from "./workspace-provider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  // ViewerBody charge le fichier au montage (fetch(file.url)) : jamais de vrai réseau en test,
  // même patron que side-panel.test.ts.
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete document.body.dataset.sheetOpen;
  vi.unstubAllGlobals();
});

/** Ouvre/ferme l'aperçu depuis l'extérieur, comme le ferait un vrai FileLink/search-palette. */
function Driver() {
  const { setPreview } = useWorkspace();
  return createElement(
    "div",
    null,
    createElement("button", { type: "button", "data-testid": "open", onClick: () => setPreview({ url: "/api/donna/files/x", name: "contrat.pdf" }) }),
    createElement("button", { type: "button", "data-testid": "close", onClick: () => setPreview(null) }),
  );
}

const mount = () => {
  act(() => {
    root.render(
      // eslint-disable-next-line react/no-children-prop -- voir workspace-provider.test.ts
      createElement(WorkspaceProvider, {
        initialConversations: [],
        initialPending: [],
        initialProjects: [],
        children: [createElement(Driver, { key: "driver" }), createElement(FileViewer, { key: "viewer", lang: "fr", labels: fr.workspace.viewer })],
      }),
    );
  });
};
const click = (testId: string) => act(() => (host.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click());

describe("FileViewer — panneau docké (plus une fenêtre modale)", () => {
  it("n'affiche rien tant qu'aucun fichier n'est en aperçu", () => {
    mount();
    expect(host.querySelector("aside")).toBeNull();
    expect(host.querySelector("dialog")).toBeNull();
  });

  it("affiche un <aside> (jamais un <dialog>) une fois un aperçu ouvert", () => {
    mount();
    click("open");
    const aside = host.querySelector("aside");
    expect(aside).toBeTruthy();
    expect(aside?.getAttribute("aria-label")).toBe("contrat.pdf");
    expect(host.querySelector("dialog")).toBeNull();
  });

  it("pose document.body.dataset.sheetOpen (le drapeau commun des volets) pendant l'aperçu, le retire à la fermeture", () => {
    mount();
    expect(document.body.dataset.sheetOpen).toBeUndefined();
    click("open");
    expect(document.body.dataset.sheetOpen).toBe("true");
    click("close");
    expect(document.body.dataset.sheetOpen).toBeUndefined();
    expect(host.querySelector("aside")).toBeNull();
  });
});
