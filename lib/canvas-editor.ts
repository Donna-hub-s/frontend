// Coloration et langage de l'éditeur du document partagé (le composant React est dans
// components/workspace/canvas-editor.tsx). Séparé pour une raison précise : ces extensions se construisent SANS
// navigateur, donc se TESTENT — voir lib/canvas-editor.test.ts, qui vérifie que l'arbre de syntaxe reconnaît
// vraiment les titres, l'emphase et le HTML/CSS écrit dans le texte.
//
// Un <textarea> ne colorait rien : « écrire un document » revenait à écrire à l'aveugle. Le texte d'un document
// n'est pas que du Markdown — l'aperçu sait rendre le HTML et le CSS — donc l'éditeur colore les deux.

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, LanguageDescription, syntaxHighlighting, type LanguageSupport } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { drawSelection, dropCursor, EditorView, keymap, placeholder as placeholderExt, rectangularSelection } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** Langages de blocs de code (```) — description seulement : le module n'est chargé qu'à l'ouverture d'un bloc. */
const FENCED_LANGUAGES: readonly LanguageDescription[] = [
  LanguageDescription.of({ name: "python", alias: ["py", "python3"], load: () => import("@codemirror/lang-python").then((m) => m.python()) }),
  LanguageDescription.of({ name: "javascript", alias: ["js", "jsx", "mjs", "cjs"], load: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })) }),
  LanguageDescription.of({ name: "json", load: () => import("@codemirror/lang-json").then((m) => m.json()) }),
  LanguageDescription.of({ name: "css", load: () => import("@codemirror/lang-css").then((m) => m.css()) }),
  LanguageDescription.of({ name: "html", alias: ["htm"], load: () => import("@codemirror/lang-html").then((m) => m.html()) }),
  LanguageDescription.of({ name: "markdown", alias: ["md"], load: () => import("@codemirror/lang-markdown").then((m) => m.markdown()) }),
];

/**
 * HTML écrit dans un document Markdown : balises colorées, et — par les extensions JavaScript et CSS intégrées à
 * `lang-html` — le contenu de `<style>` et de `<script>` aussi. `matchClosingTags: false` car un document est un
 * FRAGMENT (une cellule de tableau, un extrait), pas une page complète : signaler une balise non appariée comme
 * une erreur serait faux dans un texte de travail.
 */
export function embeddedHtml(): LanguageSupport {
  return html({ matchClosingTags: false });
}

/** Markdown GFM + HTML imbriqué + blocs de code colorés selon leur langage. */
export function documentLanguage(): LanguageSupport {
  return markdown({ base: markdownLanguage, codeLanguages: FENCED_LANGUAGES, htmlTagLanguage: embeddedHtml() });
}

/** Thème : les mêmes jetons que le reste de l'application (`app/globals.css`), pas une palette à côté.
 * `backgroundColor` était en dur en blanc (`#fff`) — jamais remarqué en clair (c'est déjà la couleur de
 * `--color-surface`), mais en sombre ça posait un texte clair sur un fond resté blanc : illisible. */
const theme = EditorView.theme({
  // Le panneau a une hauteur fixe (le <textarea> le faisait défiler) : l'éditeur est donc contraint, et c'est le
  // DÉFILEUR de CodeMirror qui scrolle. Sans cet `overflow`, un document long déborderait du cadre — le conteneur
  // masquant le débordement, le texte deviendrait inaccessible.
  "&": { color: "var(--color-ink)", backgroundColor: "var(--color-surface)", height: "100%", overflow: "hidden" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", fontSize: "0.9375rem", lineHeight: "1.75rem", overflow: "auto" },
  ".cm-content": { padding: "1rem 1.25rem", minHeight: "100%", caretColor: "var(--color-ink)" },
  ".cm-gutters": { display: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-ink)", borderLeftWidth: "2px" },
  // La sélection reste lisible sans masquer le texte (une opacité trop forte sur un texte déjà coloré).
  ".cm-selectionBackground, .cm-content ::selection": { backgroundColor: "color-mix(in srgb, var(--color-brand) 14%, transparent)" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--color-ink-3) 22%, transparent)" },
});

/**
 * Coloration : les titres reprennent la couleur d'accent du document rendu par le serveur (`document_render.py`,
 * `a { color: #7c3040 }`, soit `--color-brand`) pour que le texte tapé et son rendu se ressemblent. Le balisage
 * reste discret — c'est un texte qu'on MODIFIE, pas du code qu'on admire, et un document trop coloré devient
 * illisible à relire. Mêmes jetons `--syntax-*` que la coloration des réponses (`.donna-code` dans
 * `app/globals.css`) — étaient en dur ici (jamais remarqué en clair, mais sans variante sombre : illisible en
 * thème sombre, les teintes calées sur un fond clair tombant sous 2:1).
 */
const highlight = HighlightStyle.define([
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], color: "var(--color-brand)", fontWeight: "600" },
  { tag: [t.strong], fontWeight: "600" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strikethrough], textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--syntax-title)", textDecoration: "underline" },
  { tag: [t.quote], color: "var(--color-ink-2)", fontStyle: "italic" },
  { tag: [t.monospace], color: "var(--syntax-attr)" },
  { tag: [t.processingInstruction, t.meta], color: "var(--color-ink-3)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword, t.definitionKeyword], color: "var(--color-brand)", fontWeight: "600" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--syntax-string)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--syntax-number)" },
  { tag: [t.variableName, t.propertyName], color: "var(--syntax-attr)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--syntax-title)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--syntax-type)" },
  { tag: [t.tagName], color: "var(--color-brand)" },
  { tag: [t.attributeName], color: "var(--syntax-attr)" },
  { tag: [t.attributeValue], color: "var(--syntax-string)" },
  { tag: [t.invalid], color: "var(--color-danger)", textDecoration: "underline" },
]);

/** Extensions de l'éditeur. `onDocChange` est le seul point de sortie vers React. */
export function editorExtensions({ placeholder, ariaLabel, onDocChange }: { placeholder?: string; ariaLabel?: string; onDocChange?: (value: string) => void }): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    documentLanguage(),
    syntaxHighlighting(highlight, { fallback: true }),
    theme,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: "true", ...(ariaLabel ? { "aria-label": ariaLabel } : {}) }),
    // Le document vient d'un modèle : on ne veut ni autocomplétion d'adresse réseau, ni collage transformé en lien.
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onDocChange?.(update.state.doc.toString());
    }),
    ...(placeholder ? [placeholderExt(placeholder)] : []),
  ];
}

