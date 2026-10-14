// @vitest-environment jsdom
// Un bloc ```mermaid``` devient un diagramme (jamais pendant le flux — une syntaxe à moitié écrite échoue à
// l'analyse plutôt que de se dessiner peu à peu), un bloc de toute autre langue reste du code normal.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "./markdown";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Jamais le vrai moteur dans ces tests : seul le branchement (quel bloc devient quoi) est testé ici, pas le
// rendu réel d'un diagramme — voir le composant lui-même pour la configuration de sécurité (version figée,
// securityLevel strict, aucune valeur dérivée du diagramme, iframe sans permission).
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg viewBox="0 0 100 50"><text>A--&gt;B</text></svg>' }),
  },
}));

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

const mount = (markdown: string, streaming = false) => {
  act(() => {
    // Markdown type `children` comme un champ requis (pas une signature avec enfants en
    // paramètres variadiques) : TS exige donc `children` dans les props elles-mêmes.
    // eslint-disable-next-line react/no-children-prop
    root.render(createElement(Markdown, { streaming, children: markdown }));
  });
};

describe("Markdown — blocs ```mermaid```", () => {
  it("devient un diagramme (iframe) une fois la réponse complète", async () => {
    mount("```mermaid\ngraph TD\nA-->B\n```", false);
    // Le rendu est asynchrone (chargement du module, mermaid.render) : laisser les micro-tâches s'écouler.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.querySelector("iframe")).toBeTruthy();
    expect(host.querySelector("pre")).toBeFalsy();
  });

  it("reste du code normal pendant le flux, même étiqueté mermaid", () => {
    mount("```mermaid\ngraph TD\nA-->B\n```", true);
    expect(host.querySelector("iframe")).toBeFalsy();
    expect(host.querySelector("pre")).toBeTruthy();
    expect(host.textContent).toContain("A-->B");
  });

  it("un bloc de code d'une autre langue n'est jamais traité comme un diagramme", () => {
    mount("```python\nprint('x')\n```", false);
    expect(host.querySelector("iframe")).toBeFalsy();
    expect(host.querySelector("pre")).toBeTruthy();
  });

  // Régression réelle trouvée (pas supposée) : `theme`/`themeVariables`/`fontFamily` ne sont PAS
  // dans la liste `secure` par défaut de Mermaid — un bloc `%%{init: {...}}%%` dans le texte du
  // diagramme écrasait silencieusement la palette fixe de DONNA (vérifié avec le vrai moteur,
  // hors de ce test mocké, avant correction). `secure` est la seule chose qu'une directive ne
  // peut jamais changer d'après Mermaid lui-même — donc la seule protection qui marche vraiment.
  it("verrouille theme/themeVariables/fontFamily contre une directive %%{init}%%", async () => {
    const mermaidModule = (await import("mermaid")).default;
    mount("```mermaid\ngraph TD\nA-->B\n```", false);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const call = vi.mocked(mermaidModule.initialize).mock.calls.at(-1)?.[0];
    expect(call?.secure).toEqual(expect.arrayContaining(["theme", "themeVariables", "fontFamily"]));
  });
});
