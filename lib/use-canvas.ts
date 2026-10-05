"use client";

// Document partagé d'une conversation : la liste, le document ouvert, son éditeur (lib/canvas.ts) et l'enregistrement automatique.
// Règles : aucune saisie perdue (conflit → bandeau, voir editorReducer), enregistrement 1,2 s après la dernière frappe, relecture
// quand DONNA modifie le document ou quand l'onglet reprend le focus (un autre onglet a pu écrire).

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  canvasUrls, editorReducer, emptyEditor, parseConflict,
  type CanvasDoc, type CanvasMeta, type CanvasVersionDoc, type CanvasVersionMeta, type EditorState,
} from "./canvas";

const AUTOSAVE_MS = 1200;

type Reply<T> = { status: number; json: T | null };

async function call<T>(url: string, init?: RequestInit): Promise<Reply<T>> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init, headers: init?.body ? { "content-type": "application/json" } : undefined });
    return { status: response.status, json: response.status === 204 ? null : ((await response.json().catch(() => null)) as T | null) };
  } catch {
    return { status: 0, json: null };
  }
}

const meta = (doc: CanvasDoc): CanvasMeta => ({
  id: doc.id, conversation_id: doc.conversation_id, title: doc.title, version: doc.version, chars: doc.content.length, updated_by: doc.updated_by,
  created_at: doc.created_at, updated_at: doc.updated_at,
});

export type CanvasController = {
  list: CanvasMeta[] | null;
  activeId: string | null;
  editor: EditorState;
  loadFailed: boolean;
  /** Message d'un refus de création (limite atteinte…). */
  createError: string | null;
  select: (id: string) => void;
  edit: (patch: { title?: string; content?: string }) => void;
  create: () => Promise<void>;
  remove: () => Promise<void>;
  restore: (version: number) => Promise<boolean>;
  versions: () => Promise<CanvasVersionMeta[] | null>;
  versionDoc: (version: number) => Promise<CanvasVersionDoc | null>;
  takeTheirs: () => void;
  keepMine: () => void;
  dismissNotice: () => void;
};

/**
 * @param conversationId conversation affichée (null : pas encore créée, donc pas de document)
 * @param activityKey signature de ce que DONNA a fait au document (lib/canvas.ts::canvasActivity) : change → relecture
 * @param touchedId dernier document touché par DONNA : c'est lui qu'on ouvre
 */
export function useCanvas(conversationId: string | null, activityKey: string, touchedId: string | null): CanvasController {
  const [list, setList] = useState<CanvasMeta[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editor, dispatch] = useReducer(editorReducer, emptyEditor);
  const [loadFailed, setLoadFailed] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const editorRef = useRef(editor);
  const activeRef = useRef(activeId);
  const listRef = useRef(list);
  useEffect(() => {
    editorRef.current = editor;
    activeRef.current = activeId;
    listRef.current = list;
  });

  const refreshList = useCallback(async (conversation: string): Promise<CanvasMeta[] | null> => {
    const reply = await call<CanvasMeta[]>(canvasUrls.list(conversation));
    if (reply.status !== 200 || !reply.json) {
      setLoadFailed(true);
      return null;
    }
    setLoadFailed(false);
    setList(reply.json);
    return reply.json;
  }, []);

  // Changement de conversation : on repart de zéro, puis on lit la liste.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setList(null);
      setActiveId(null);
      dispatch({ type: "reset" });
      if (!conversationId) return;
      const found = await refreshList(conversationId);
      if (!cancelled && found?.length) setActiveId(found[0].id);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, refreshList]);

  const fetchDoc = useCallback(async (id: string): Promise<CanvasDoc | null> => {
    const reply = await call<CanvasDoc>(canvasUrls.one(id));
    if (reply.status !== 200 || !reply.json) return null;
    return reply.json;
  }, []);

  // Document ouvert : on le lit (premier affichage ou changement de document).
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void fetchDoc(activeId).then((doc) => {
      if (cancelled) return;
      if (doc) dispatch({ type: "load", doc });
      else setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, fetchDoc]);

  // DONNA a créé ou modifié un document : on relit la liste, on ouvre ce document-là et on prend sa nouvelle version.
  const firstActivity = useRef(true);
  useEffect(() => {
    if (firstActivity.current) {
      firstActivity.current = false;
      return;
    }
    if (!conversationId) return;
    let cancelled = false;
    void (async () => {
      const found = await refreshList(conversationId);
      if (cancelled || !found) return;
      const target = touchedId && found.some((c) => c.id === touchedId) ? touchedId : (activeRef.current ?? found[0]?.id ?? null);
      if (!target) return;
      if (target !== activeRef.current) {
        setActiveId(target);
        return; // l'effet « document ouvert » le charge
      }
      const doc = await fetchDoc(target);
      if (!cancelled && doc) dispatch({ type: "remote", doc });
    })();
    return () => {
      cancelled = true;
    };
    // `touchedId` et `conversationId` accompagnent la signature : seule `activityKey` déclenche la relecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityKey]);

  // Retour sur l'onglet : un autre onglet (ou appareil) a pu modifier le document.
  useEffect(() => {
    const onVisible = () => {
      const id = activeRef.current;
      if (document.visibilityState !== "visible" || !id) return;
      void fetchDoc(id).then((doc) => doc && dispatch({ type: "remote", doc }));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchDoc]);

  // Enregistrement automatique, sur la version qu'on a sous les yeux : une modification entre-temps = conflit, jamais un écrasement.
  useEffect(() => {
    if (editor.status !== "dirty" || !editor.doc?.id) return;
    const doc = editor.doc;
    const timer = window.setTimeout(() => {
      const current = editorRef.current;
      if (current.status !== "dirty" || current.doc?.id !== doc.id) return;
      dispatch({ type: "saving" });
      void call<CanvasDoc | { detail?: unknown }>(canvasUrls.one(doc.id), {
        method: "PUT",
        body: JSON.stringify({ content: current.content, title: current.title, expected_version: current.doc.version, checkpoint: current.checkpoint }),
      }).then((reply) => {
        if (reply.status === 200 && reply.json) {
          const saved = reply.json as CanvasDoc;
          dispatch({ type: "saved", doc: saved });
          setList((items) => (items ? items.map((item) => (item.id === saved.id ? meta(saved) : item)) : items));
          return;
        }
        const conflict = reply.status === 409 ? parseConflict(reply.json) : null;
        dispatch(conflict ? { type: "conflict", conflict } : { type: "failed" });
      });
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [editor.status, editor.content, editor.title, editor.doc]);

  // Fermeture de l'onglet ou de la conversation avec du texte non enregistré : une dernière tentative.
  useEffect(
    () => () => {
      const current = editorRef.current;
      if (current.status !== "dirty" || !current.doc?.id) return;
      void fetch(canvasUrls.one(current.doc.id), {
        method: "PUT", keepalive: true, headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: current.content, title: current.title, expected_version: current.doc.version }),
      }).catch(() => undefined);
    },
    [],
  );

  const create = useCallback(async () => {
    if (!conversationId) return;
    setCreateError(null);
    const reply = await call<CanvasDoc | { detail?: unknown }>(canvasUrls.list(conversationId), { method: "POST", body: JSON.stringify({}) });
    if (reply.status === 201 && reply.json) {
      const doc = reply.json as CanvasDoc;
      setList((items) => [...(items ?? []), meta(doc)]);
      setActiveId(doc.id);
      dispatch({ type: "load", doc });
      return;
    }
    const detail = reply.json && typeof (reply.json as { detail?: unknown }).detail === "string" ? ((reply.json as { detail: string }).detail) : null;
    setCreateError(detail ?? "");
  }, [conversationId]);

  const remove = useCallback(async () => {
    const id = activeRef.current;
    if (!id) return;
    const reply = await call<null>(canvasUrls.one(id), { method: "DELETE" });
    if (reply.status !== 204) return;
    const rest = (listRef.current ?? []).filter((item) => item.id !== id);
    setList(rest);
    setActiveId(rest[0]?.id ?? null);
    if (!rest.length) dispatch({ type: "reset" });
  }, []);

  const restore = useCallback(async (version: number): Promise<boolean> => {
    const current = editorRef.current;
    if (!current.doc?.id) return false;
    const reply = await call<CanvasDoc>(canvasUrls.restore(current.doc.id), { method: "POST", body: JSON.stringify({ version, expected_version: current.doc.version }) });
    if (reply.status !== 200 || !reply.json) return false;
    dispatch({ type: "load", doc: reply.json });
    setList((items) => (items ? items.map((item) => (item.id === reply.json!.id ? meta(reply.json!) : item)) : items));
    return true;
  }, []);

  const versions = useCallback(async () => {
    const id = activeRef.current;
    if (!id) return null;
    return (await call<CanvasVersionMeta[]>(canvasUrls.versions(id))).json;
  }, []);

  const versionDoc = useCallback(async (version: number) => {
    const id = activeRef.current;
    if (!id) return null;
    return (await call<CanvasVersionDoc>(canvasUrls.version(id, version))).json;
  }, []);

  return {
    list, activeId, editor, loadFailed, createError,
    select: setActiveId,
    edit: useCallback((patch) => dispatch({ type: "edit", ...patch }), []),
    create, remove, restore, versions, versionDoc,
    takeTheirs: useCallback(() => dispatch({ type: "takeTheirs" }), []),
    keepMine: useCallback(() => dispatch({ type: "keepMine" }), []),
    dismissNotice: useCallback(() => dispatch({ type: "dismissNotice" }), []),
  };
}
