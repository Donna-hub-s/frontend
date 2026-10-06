"use client";

// Le composant React de l'éditeur : très mince à dessein. Il ne connaît ni le serveur, ni les versions, ni les
// conflits — `lib/use-canvas.ts` (réducteur, enregistrement automatique, conflit) décide. La règle « une saisie
// n'est jamais perdue » reste ainsi à un seul endroit.
//
// Deux invariants :
//   1. La vue n'est créée qu'une fois. La recréer à chaque frappe effacerait l'historique (⌘Z) et le curseur.
//   2. Le texte reçu en propriété ne replace la vue QUE s'il diffère de ce qu'elle contient : sinon on casserait
//      le curseur et l'annulation à chaque caractère tapé.

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { editorExtensions } from "@/lib/canvas-editor";

export function CanvasEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // La vue retient la DERNIÈRE version de `onChange` dans une ref : c'est ce qui permet de ne jamais recréer la
  // vue, donc de garder l'historique d'annulation pendant toute sa vie. La ref se met à jour APRÈS le rendu
  // (une ref écrite pendant le rendu est interdite par React) — le temps que la frappe qui vient d'arriver soit
  // traitée, l'effet a déjà tourné.
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!host.current) return;
    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: editorExtensions({
          placeholder,
          ariaLabel,
          onDocChange: (text) => change.current(text),
        }),
      }),
    });
    view.current = instance;
    return () => {
      view.current = null;
      instance.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le texte a changé ailleurs (DONNA, un autre onglet, un conflit résolu) : on ne réécrit la vue que si elle ne
  // contient pas déjà ce texte.
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const current = instance.state.doc.toString();
    if (current === value) return;
    const caret = Math.min(instance.state.selection.main.head, value.length);
    instance.dispatch({ changes: { from: 0, to: current.length, insert: value }, selection: { anchor: caret } });
  }, [value]);

  return <div ref={host} data-testid="canvas-editor" className="size-full overflow-hidden bg-white" />;
}