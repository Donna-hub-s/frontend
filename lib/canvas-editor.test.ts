// Coloration de l'éditeur du document partagé : vérifiée par l'ARBRE DE SYNTAXE, pas par une capture d'écran.
//
// Raison d'être du fichier : l'éditeur est passé d'un <textarea> (aucune coloration) à CodeMirror, et le reproche
// était précisément « l'écriture ne tient pas compte de la syntaxe Markdown ». Un test qui vérifie qu'une extension
// existe ne prouverait rien — ce qui compte est que l'analyseur reconnaisse les nœuds (titre, emphase, lien, bloc
// de code) : ce sont eux qui portent les couleurs. Sans DOM, aucun rendu de composant, comme le reste de la suite.

import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { documentLanguage, editorExtensions, embeddedHtml } from "./canvas-editor";

/**
 * Noms des nœuds reconnus dans un document, tous types confondus.
 *
 * `ensureSyntaxTree` et non `syntaxTree` : l'analyse est PARESSEUSE, elle avance par lots. Sans vue, `syntaxTree` ne
 * renvoie que ce qui a déjà été analysé — sous charge (fichiers de test lancés en parallèle), le premier lot suffisait et
 * la fin du document manquait, d'un run à l'autre. On exige ici l'analyse complète, ou l'échec se voit.
 */
function parse(content: string): string[] {
  const state = EditorState.create({ doc: content, extensions: [documentLanguage()] });
  const tree = ensureSyntaxTree(state, content.length, 10_000);
  expect(tree, "analyse du document inachevée").not.toBeNull();
  const names: string[] = [];
  tree!.iterate({ enter: (node) => void names.push(node.name) });
  return [...new Set(names)];
}

describe("éditeur du document partagé", () => {
  it("reconnaît la syntaxe Markdown : titre, emphase, fort, lien", () => {
    expect(parse("# Titre\n\nDu *gras* et du **fort** et un [lien](https://exemple.fr).")).toEqual(
      expect.arrayContaining(["ATXHeading1", "HeaderMark", "Emphasis", "EmphasisMark", "StrongEmphasis", "Link", "URL"]),
    );
  });

  it("reconnaît les listes, les listes de tâches GFM et les citations", () => {
    expect(parse("- un\n- deux")).toEqual(expect.arrayContaining(["BulletList", "ListItem", "ListMark"]));
    expect(parse("- [x] fait\n- [ ] à faire")).toEqual(expect.arrayContaining(["Task", "TaskMarker"]));
    expect(parse("> cité")).toEqual(expect.arrayContaining(["Blockquote", "QuoteMark"]));
  });

  it("reconnaît un bloc de code délimité, donc colorable selon le langage annoncé", () => {
    expect(parse("```python\nprint(1)\n```")).toEqual(expect.arrayContaining(["FencedCode", "CodeInfo", "CodeText"]));
  });

  it("colore le HTML écrit EN LIGNE dans le texte", () => {
    expect(parse('du texte et <span class="x">du html</span> sur la même ligne')).toEqual(expect.arrayContaining(["Paragraph", "HTMLTag"]));
  });

  it("reconnaît un bloc HTML entier plutôt que de le laisser passer en texte brut", () => {
    // Un <style> ou un <div> en début de ligne devient HTMLBlock : il n'est PAS décomposé balise par balise (le
    // parseur Markdown n'y branche pas l'analyseur HTML — `parseMixed` est incompatible avec lui, `this.nest`).
    // Le test verrouille ce comportement pour qu'on sache ce qui est colorable, plutôt que de le supposer.
    expect(parse('<div class="carte">\n<p>Bonjour</p>\n</div>')).toEqual(expect.arrayContaining(["HTMLBlock"]));
    expect(parse("<style>\n.bouton { color: red; }\n</style>")).toEqual(expect.arrayContaining(["HTMLBlock"]));
  });

  it("n'accuse pas une balise non appariée : un document est un fragment, pas une page", () => {
    const content = "<p>fin de paragraphe";
    const fragment = EditorState.create({ doc: content, extensions: [embeddedHtml()] });
    const tree = ensureSyntaxTree(fragment, content.length, 10_000);
    expect(tree).not.toBeNull();
    const names: string[] = [];
    tree!.iterate({ enter: (node) => void names.push(node.name) });
    expect(names.join(" ")).not.toMatch(/[Ee]rror/i);
  });

  it("les extensions de l'éditeur s'assemblent et se montent sur un document", () => {
    const initial = EditorState.create({ doc: "# Titre", extensions: editorExtensions({ placeholder: "Écrivez ici", ariaLabel: "Document" }) });
    expect(initial.doc.toString()).toBe("# Titre");
    // `update` renvoie une transaction ; c'est son état qui porte le texte saisi.
    const typed = initial.update({ changes: { from: 0, insert: "x" } });
    expect(typed.state.doc.toString()).toBe("x# Titre");
  });
});