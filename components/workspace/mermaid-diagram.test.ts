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

// jsdom n'implémente pas <dialog>.showModal() / close().
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

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

// ── Taille, outils et grand affichage ────────────────────────────────────────────────────────────────────────────

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

const button = (label: string) => document.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;

async function mountWith(svg: string, source = "graph TD\nA-->B") {
  const mermaidModule = (await import("mermaid")).default;
  vi.mocked(mermaidModule.render).mockResolvedValue({ svg, bindFunctions: undefined, diagramType: "flowchart" });
  mount(`\`\`\`mermaid\n${source}\n\`\`\``, false);
  await flush();
  return mermaidModule;
}

describe("MermaidDiagram — taille et outils", () => {
  afterEach(async () => {
    const mermaidModule = (await import("mermaid")).default;
    vi.mocked(mermaidModule.render).mockResolvedValue({ svg: '<svg viewBox="0 0 100 50"><text>A--&gt;B</text></svg>', bindFunctions: undefined, diagramType: "flowchart" });
  });

  it("garde la taille naturelle : une ligne de dix étapes n'est plus écrasée en bande de 25 px (bug d'origine)", async () => {
    await mountWith('<svg viewBox="0 0 1713 70"><text>x</text></svg>');
    const frame = host.querySelector("iframe") as HTMLIFrameElement;
    // 1713 × 0,7 ≈ 1199 px au plancher : sur une colonne de 628 px le cadre défile au lieu de se réduire à 25 px de haut.
    expect(frame.style.width).toContain("1199px");
    expect(frame.style.aspectRatio.replace(/\s/g, "")).toBe("1713/70");
    expect(frame.parentElement?.className).toContain("overflow-auto");
  });

  it("n'agrandit pas un petit diagramme au-delà de sa taille", async () => {
    await mountWith('<svg viewBox="0 0 300 120"><text>x</text></svg>');
    expect((host.querySelector("iframe") as HTMLIFrameElement).style.width).toContain("min(100%, 300px)");
  });

  it("étire le SVG à la taille du cadre en écrasant son width/max-width de Mermaid", async () => {
    await mountWith('<svg width="100%" viewBox="0 0 300 120" style="max-width: 300px"><text>x</text></svg>');
    const doc = (host.querySelector("iframe") as HTMLIFrameElement).getAttribute("srcdoc") ?? "";
    expect(doc).toContain("width:100%!important");
    expect(doc).toContain("max-width:none!important");
  });

  it("garde le cadre sans aucune permission, comme avant", async () => {
    await mountWith('<svg viewBox="0 0 300 120"></svg>');
    expect((host.querySelector("iframe") as HTMLIFrameElement).getAttribute("sandbox")).toBe("");
  });

  it("copie le texte source du diagramme", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await mountWith('<svg viewBox="0 0 300 120"></svg>', "graph TD\nA-->B");
    await act(async () => button("Copy")!.click());
    expect(writeText).toHaveBeenCalledWith("graph TD\nA-->B");
  });

  it("ouvre le diagramme en grand, zoome, et se referme", async () => {
    await mountWith('<svg viewBox="0 0 800 400"><text>x</text></svg>');
    await act(async () => button("Enlarge")!.click());
    const dialog = document.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    const frame = () => dialog.querySelector("iframe") as HTMLIFrameElement;
    expect(frame().getAttribute("sandbox")).toBe("");
    const before = Number.parseInt(frame().style.width, 10);

    await act(async () => button("Zoom in")!.click());
    expect(Number.parseInt(frame().style.width, 10)).toBeGreaterThan(before);
    await act(async () => button("Zoom out")!.click());
    await act(async () => button("Zoom out")!.click());
    expect(Number.parseInt(frame().style.width, 10)).toBeLessThan(before);

    await act(async () => button("Close")!.click());
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("télécharge une image dessinée À PART, en étiquettes simples (le SVG affiché a des foreignObject, qui souillent le canevas)", async () => {
    const mermaidModule = await mountWith('<svg viewBox="0 0 300 120"></svg>', "graph TD\nA-->B");
    await act(async () => button("Download as image")!.click());
    await flush();
    const sources = vi.mocked(mermaidModule.render).mock.calls.map((call) => String(call[1]));
    expect(sources.some((source) => source.includes('"htmlLabels": false') && source.includes("graph TD"))).toBe(true);
    // Sans navigateur pour dessiner (jsdom), l'échec est dit, pas avalé.
    expect(host.textContent).toContain("Image unavailable.");
  });
});
