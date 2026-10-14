// L'aperçu d'un document partagé est une page rendue PAR LE SERVEUR (`document_render.py`), affichée dans un
// cadre `sandbox` SANS `allow-scripts` : un bloc ```mermaid``` y ressortait donc en bloc de code, puisque
// Mermaid est du JavaScript et que rien ne s'exécute dans ce cadre.
//
// Le diagramme est donc dessiné ICI, dans la page de l'application, et seul son SVG est posé dans le document
// avant affichage. Le cadre ne gagne AUCUNE permission : il reste sans `allow-scripts` (le texte du document
// vient d'un modèle et peut refléter des données externes — avec `allow-same-origin`, lui donner le script
// serait une XSS stockée dans l'origine de l'application), et la CSP du document reste celle que le serveur a
// écrite dans le `<head>`. C'est exactement le cas que `render_document` avait prévu en posant la CSP deux
// fois : l'en-tête HTTP disparaît avec `srcDoc`, la balise `<meta>` traverse ce passage.
//
// Ce que cela ne change pas : les exports PDF (WeasyPrint) et Word continuent d'afficher le bloc de code. Le
// dessin n'existe que dans le navigateur ; l'« impression » de l'aperçu, elle, voit bien le diagramme.

/** Une clôture ```mermaid``` dans la source : simple pré-test, il décide seulement s'il vaut la peine de
 * relire le document rendu. Un faux négatif rend l'aperçu du serveur tel quel, un faux positif coûte une
 * analyse pour rien — jamais un diagramme faux. */
const MERMAID_FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*mermaid[ \t]*$/im;
export const hasMermaidBlock = (markdown: string): boolean => MERMAID_FENCE.test(markdown);

/** Éléments qui vont chercher une ressource. `foreignObject` n'en est PAS : Mermaid y met ses libellés,
 * le retirer viderait les diagrammes de leur texte. */
const FETCHING_TAGS = new Set(["script", "image"]);

/**
 * Le SVG vient de Mermaid (`securityLevel: "strict"`) et le cadre qui l'affiche n'a aucune permission de
 * script : ce nettoyage est une troisième barrière, pas la première. On retire ce qui sort du document —
 * gestionnaires d'événements, liens non internes, éléments qui chargent une ressource.
 */
function scrubSvg(root: Element): void {
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (FETCHING_TAGS.has(element.tagName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const { name, value } of [...element.attributes]) {
      const key = name.toLowerCase();
      // Une ancre interne (`#id`) sert aux marqueurs de flèches ; tout le reste sortirait du document.
      if (key.startsWith("on") || ((key === "href" || key.endsWith(":href")) && !value.startsWith("#"))) {
        element.removeAttribute(name);
      }
    }
  }
}

/**
 * Le document rendu, ses blocs ```mermaid``` remplacés par leur dessin. Travaille sur un ARBRE (`DOMParser`,
 * qui n'exécute rien et ne charge rien), jamais par expression régulière — même règle que l'assainissement
 * côté serveur. Un diagramme que Mermaid refuse laisse SON bloc de code en place : rien n'est perdu, et les
 * autres diagrammes de la page sont dessinés quand même.
 */
export async function inlineMermaid(html: string, render: (source: string, index: number) => Promise<string>): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = [...doc.querySelectorAll("pre > code.language-mermaid")];
  if (!blocks.length) return html;

  await Promise.all(
    blocks.map(async (code, index) => {
      const pre = code.parentElement;
      if (!pre) return;
      let svg: string;
      try {
        svg = await render(code.textContent ?? "", index);
      } catch {
        return; // syntaxe refusée, moteur indisponible : le bloc de code reste lisible
      }
      const figure = doc.createElement("figure");
      figure.setAttribute("style", "margin:.75em 0;text-align:center");
      // `innerHTML` sur un document de `DOMParser` : rien n'est ni exécuté ni chargé (le document n'est pas
      // affiché, et l'insertion par `innerHTML` n'exécute jamais un script, même dans une page vivante).
      figure.innerHTML = svg;
      const drawing = figure.firstElementChild;
      if (!drawing || drawing.tagName.toLowerCase() !== "svg") return;
      scrubSvg(drawing);
      // Mermaid fixe une largeur en pixels : sans cela, un diagramme large déborde de la page imprimée.
      drawing.setAttribute("style", "max-width:100%;height:auto");
      pre.replaceWith(figure);
    }),
  );

  return `<!doctype html>${doc.documentElement.outerHTML}`;
}
