// @vitest-environment jsdom
// Les diagrammes de l'aperçu d'un document partagé : dessinés dans la page de l'application, posés en SVG dans
// le document rendu par le serveur — qui, lui, n'exécute aucun script (voir canvas-preview.ts).
import { describe, expect, it, vi } from "vitest";
import { hasMermaidBlock, inlineMermaid } from "./canvas-preview";

const page = (body: string) =>
  '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
  "<meta content=\"default-src 'none'; style-src 'unsafe-inline'\" http-equiv=\"Content-Security-Policy\">" +
  `<title>Document</title></head><body>${body}</body></html>`;

const block = (source = "timeline") => `<pre><code class="language-mermaid">${source}</code></pre>`;
const svg = async () => '<svg viewBox="0 0 100 50" width="100"><text>A</text></svg>';

describe("hasMermaidBlock", () => {
  it("reconnaît une clôture mermaid, en trois ou quatre backticks, en tildes, indentée", () => {
    expect(hasMermaidBlock("texte\n```mermaid\ngraph TD\n```")).toBe(true);
    expect(hasMermaidBlock("````mermaid\ngraph TD\n````")).toBe(true);
    expect(hasMermaidBlock("~~~mermaid\ngraph TD\n~~~")).toBe(true);
    expect(hasMermaidBlock("  ```mermaid  \ngraph TD\n```")).toBe(true);
  });

  it("ignore un autre langage et le mot « mermaid » en texte courant", () => {
    expect(hasMermaidBlock("```python\nprint('mermaid')\n```")).toBe(false);
    expect(hasMermaidBlock("J'aime bien mermaid pour les schémas.")).toBe(false);
  });
});

describe("inlineMermaid", () => {
  it("remplace le bloc de code par le dessin, et garde la CSP du serveur", async () => {
    const html = await inlineMermaid(page(`<h2>Parcours</h2>${block()}`), svg);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("pre")).toBeNull();
    expect(doc.querySelector("figure > svg")).toBeTruthy();
    expect(doc.querySelector("h2")?.textContent).toBe("Parcours");
    // L'en-tête HTTP disparaît avec `srcDoc` : la balise <meta> est tout ce qui reste de la CSP.
    expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content")).toContain("default-src 'none'");
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });

  it("borne la largeur du dessin : un diagramme large déborderait de la page imprimée", async () => {
    const html = await inlineMermaid(page(block()), svg);
    const drawing = new DOMParser().parseFromString(html, "text/html").querySelector("svg");
    expect(drawing?.getAttribute("style")).toBe("max-width:100%;height:auto");
  });

  it("laisse SON bloc de code au diagramme refusé, et dessine quand même les autres", async () => {
    const render = vi.fn(async (_source: string, index: number) => {
      if (index === 0) throw new Error("syntaxe invalide");
      return '<svg viewBox="0 0 10 10"></svg>';
    });
    const html = await inlineMermaid(page(block("invalide") + block("timeline")), render);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll("pre")).toHaveLength(1);
    expect(doc.querySelector("pre")?.textContent).toBe("invalide");
    expect(doc.querySelectorAll("svg")).toHaveLength(1);
  });

  it("ne touche ni à un document sans diagramme ni à un bloc d'un autre langage", async () => {
    const source = page('<pre><code class="language-python">print(1)</code></pre>');
    expect(await inlineMermaid(source, svg)).toBe(source);
  });

  // Troisième barrière : Mermaid assainit déjà (securityLevel « strict ») et le cadre n'a aucune permission de
  // script. Ce qui sort du document part quand même — on ne parie pas sur ce que les deux autres couvrent.
  it("retire des gestionnaires d'événements, les liens externes et ce qui charge une ressource", async () => {
    const hostile = async () =>
      '<svg viewBox="0 0 10 10" onload="alert(1)">' +
      '<script>alert(2)</script>' +
      '<image href="https://exemple.test/pixel.png"></image>' +
      '<a href="https://exemple.test/fuite?jeton=secret"><text onclick="alert(3)">x</text></a>' +
      '<use href="#fleche"></use>' +
      "</svg>";
    const html = await inlineMermaid(page(block()), hostile);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const drawing = doc.querySelector("svg");
    expect(drawing?.hasAttribute("onload")).toBe(false);
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector("image")).toBeNull();
    expect(doc.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(doc.querySelector("text")?.hasAttribute("onclick")).toBe(false);
    // Une ancre interne reste : c'est ainsi que Mermaid référence ses marqueurs de flèches.
    expect(doc.querySelector("use")?.getAttribute("href")).toBe("#fleche");
  });
});
