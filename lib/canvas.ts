// Document partagé (backend/app/chat/src/canvas.py) : types, adresses, et l'état de l'éditeur — pur, donc testable sans navigateur.
//
// Ce que l'éditeur garantit : une saisie n'est JAMAIS perdue ni écrasée en silence. Si le document change côté serveur pendant qu'on
// tape (DONNA a modifié, ou un autre onglet), l'éditeur passe en « conflit » en gardant le brouillon ; l'utilisateur choisit sa
// version ou celle du serveur — rien ne se décide tout seul.

import type { ToolCall } from "./workspace-types";

export type CanvasAuthor = "user" | "donna";

export type CanvasMeta = {
  id: string;
  conversation_id: string;
  title: string;
  version: number;
  chars: number;
  updated_by: CanvasAuthor;
  created_at: string;
  updated_at: string;
};
export type CanvasDoc = CanvasMeta & { content: string };

export type CanvasVersionMeta = { version: number; title: string; author: CanvasAuthor; note: string | null; chars: number; created_at: string };
export type CanvasVersionDoc = CanvasVersionMeta & { content: string };

export const CANVAS_TOOLS = ["canvas_write", "canvas_edit"] as const;
export const EXPORT_FORMATS = ["md", "docx", "pdf"] as const;
export type CanvasExportFormat = (typeof EXPORT_FORMATS)[number];

const base = "/api/donna/chat/canvas";
export const canvasUrls = {
  list: (conversationId: string) => `${base}/by-conversation/${encodeURIComponent(conversationId)}`,
  one: (id: string) => `${base}/${encodeURIComponent(id)}`,
  versions: (id: string) => `${base}/${encodeURIComponent(id)}/versions`,
  version: (id: string, version: number) => `${base}/${encodeURIComponent(id)}/versions/${version}`,
  restore: (id: string) => `${base}/${encodeURIComponent(id)}/restore`,
  export: (id: string, format: CanvasExportFormat) => `${base}/${encodeURIComponent(id)}/export?format=${format}`,
  // PDF/Word avec les diagrammes Mermaid dessinés par le navigateur (voir lib/conversation-export.ts).
  exportDiagrams: (id: string) => `${base}/${encodeURIComponent(id)}/export/diagrams`,
  exportPost: (id: string) => `${base}/${encodeURIComponent(id)}/export`,
  // Le document rendu par le serveur : c'est cette page qu'affiche l'aperçu ET que les exports convertissent.
  // Un aperçu rendu dans le navigateur ne pourrait pas garantir qu'un export lui ressemble.
  render: (id: string) => `${base}/${encodeURIComponent(id)}/render`,
};

// ── Ce que DONNA a fait pendant la conversation ──────────────────────────────

/** Un appel d'outil de document qui a VRAIMENT modifié le document (un refus commence par « Refusé » ou « Document non modifié »). */
export const changedTheDocument = (call: Pick<ToolCall, "name" | "result">): boolean =>
  (CANVAS_TOOLS as readonly string[]).includes(call.name) && Boolean(call.result) && !/^(Refusé|Document non modifié|Contenu vide|Fournis|Plusieurs documents|Aucun document|Document introuvable)/.test(call.result);

const ID_IN_RESULT = /identifiant ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

/**
 * Signature de ce que DONNA a fait au document dans ces messages : change dès qu'elle le crée ou le modifie (le panneau se met à
 * jour). `canvasId` : le dernier document touché (lu dans le résultat de l'outil), pour l'ouvrir.
 */
export function canvasActivity(messages: { tools?: Pick<ToolCall, "name" | "result">[] }[]): { count: number; key: string; canvasId: string | null } {
  let count = 0;
  let last = "";
  for (const message of messages) {
    for (const call of message.tools ?? []) {
      if (!changedTheDocument(call)) continue;
      count++;
      last = call.result;
    }
  }
  return { count, key: `${count}:${last}`, canvasId: ID_IN_RESULT.exec(last)?.[1] ?? null };
}

// ── Conflit d'enregistrement ─────────────────────────────────────────────────

export type Conflict = { currentVersion: number; updatedBy: CanvasAuthor; current: CanvasDoc };

/** Corps d'une réponse 409 de PUT /canvas/{id} (`detail` porte l'état courant), ou null si ce n'est pas un conflit lisible. */
export function parseConflict(body: unknown): Conflict | null {
  const detail = typeof body === "object" && body !== null ? (body as { detail?: unknown }).detail : null;
  if (typeof detail !== "object" || detail === null) return null;
  const { current, current_version: currentVersion, updated_by: updatedBy } = detail as { current?: CanvasDoc; current_version?: number; updated_by?: string };
  if (!current || typeof current.content !== "string" || typeof currentVersion !== "number") return null;
  return { currentVersion, updatedBy: updatedBy === "donna" ? "donna" : "user", current };
}

// ── L'éditeur : un état, des événements, aucune saisie perdue ────────────────

export type SaveStatus = "saved" | "dirty" | "saving" | "conflict" | "error";

export type EditorState = {
  /** Dernier état connu du serveur. */
  doc: CanvasDoc | null;
  title: string;
  content: string;
  status: SaveStatus;
  conflict: Conflict | null;
  /** Le texte vient d'être mis à jour par DONNA (bandeau « DONNA a modifié le document »). */
  updatedByDonna: boolean;
  /** Le prochain enregistrement est un point de reprise : il ne se fond pas dans la version précédente (suite d'un conflit résolu). */
  checkpoint: boolean;
};

export type EditorEvent =
  | { type: "reset" }
  | { type: "load"; doc: CanvasDoc }
  | { type: "edit"; title?: string; content?: string }
  | { type: "saving" }
  | { type: "saved"; doc: CanvasDoc }
  | { type: "conflict"; conflict: Conflict }
  | { type: "failed" }
  | { type: "remote"; doc: CanvasDoc }
  | { type: "takeTheirs" }
  | { type: "keepMine" }
  | { type: "dismissNotice" };

export const emptyEditor: EditorState = { doc: null, title: "", content: "", status: "saved", conflict: null, updatedByDonna: false, checkpoint: false };

const matches = (state: EditorState, doc: CanvasDoc): boolean => state.title === doc.title && state.content === doc.content;

export function editorReducer(state: EditorState, event: EditorEvent): EditorState {
  switch (event.type) {
    case "reset":
      return emptyEditor;
    case "load":
      return { doc: event.doc, title: event.doc.title, content: event.doc.content, status: "saved", conflict: null, updatedByDonna: false, checkpoint: false };
    case "edit": {
      if (!state.doc) return state;
      const next = { ...state, title: event.title ?? state.title, content: event.content ?? state.content, updatedByDonna: false };
      if (state.status === "conflict") return next; // on garde le brouillon ; le choix se fait dans le bandeau
      return { ...next, status: matches(next, state.doc) ? "saved" : "dirty" };
    }
    case "saving":
      return state.status === "dirty" || state.status === "error" ? { ...state, status: "saving" } : state;
    case "saved": {
      // Ce qui a été tapé PENDANT l'enregistrement n'est pas dans `doc` : on repasse en « à enregistrer », on n'écrase pas.
      const status: SaveStatus = matches(state, event.doc) ? "saved" : "dirty";
      return { ...state, doc: event.doc, status, conflict: null, checkpoint: false }; // l'enregistrement qui vient de passer a consommé le point de reprise
    }
    case "conflict":
      return { ...state, status: "conflict", conflict: event.conflict };
    case "failed":
      return state.status === "saving" ? { ...state, status: "error" } : state;
    case "remote": {
      if (state.doc && event.doc.id === state.doc.id && event.doc.version <= state.doc.version) return state; // rien de plus récent
      if (!state.doc || event.doc.id !== state.doc.id) return editorReducer(state, { type: "load", doc: event.doc });
      if (state.status === "saved") {
        return { doc: event.doc, title: event.doc.title, content: event.doc.content, status: "saved", conflict: null, updatedByDonna: event.doc.updated_by === "donna", checkpoint: false };
      }
      // Du texte non enregistré : on ne l'écrase pas, on propose le choix.
      return { ...state, status: "conflict", conflict: { currentVersion: event.doc.version, updatedBy: event.doc.updated_by, current: event.doc } };
    }
    case "takeTheirs":
      if (!state.conflict) return state;
      return { doc: state.conflict.current, title: state.conflict.current.title, content: state.conflict.current.content, status: "saved", conflict: null, updatedByDonna: state.conflict.updatedBy === "donna", checkpoint: false };
    case "keepMine":
      // La saisie se fonde désormais sur la version courante : le prochain enregistrement la garde, l'autre reste dans l'historique.
      return state.conflict
        ? { ...state, doc: state.conflict.current, status: matches(state, state.conflict.current) ? "saved" : "dirty", conflict: null, checkpoint: true }
        : state;
    case "dismissNotice":
      return { ...state, updatedByDonna: false };
  }
}
