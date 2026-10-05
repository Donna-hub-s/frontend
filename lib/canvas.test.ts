import { describe, expect, it } from "vitest";
import { canvasActivity, canvasUrls, changedTheDocument, editorReducer, emptyEditor, parseConflict, type CanvasDoc, type EditorEvent, type EditorState } from "./canvas";

const doc = (patch: Partial<CanvasDoc> = {}): CanvasDoc => ({
  id: "c1", conversation_id: "conv", title: "Lettre", version: 1, chars: 5, updated_by: "user", created_at: "2026-10-03T10:00:00Z", updated_at: "2026-10-03T10:00:00Z", content: "Texte", ...patch,
});
const run = (events: EditorEvent[], from: EditorState = emptyEditor): EditorState => events.reduce(editorReducer, from);
const open = (patch: Partial<CanvasDoc> = {}) => run([{ type: "load", doc: doc(patch) }]);

describe("adresses", () => {
  it("encode les identifiants et construit l'export", () => {
    expect(canvasUrls.one("a/b")).toBe("/api/donna/chat/canvas/a%2Fb");
    expect(canvasUrls.list("c 1")).toBe("/api/donna/chat/canvas/by-conversation/c%201");
    expect(canvasUrls.export("x", "docx")).toBe("/api/donna/chat/canvas/x/export?format=docx");
    expect(canvasUrls.version("x", 3)).toBe("/api/donna/chat/canvas/x/versions/3");
  });
});

describe("activité de DONNA", () => {
  it("compte ce qui a vraiment modifié le document, pas les refus ni les lectures", () => {
    expect(changedTheDocument({ name: "canvas_write", result: "Document créé. Document « L » (identifiant x), version 1" })).toBe(true);
    expect(changedTheDocument({ name: "canvas_edit", result: "1 remplacement(s) effectué(s). Document « L »" })).toBe(true);
    for (const result of ["Refusé : tu n'as pas lu la version courante", "Document non modifié : trop long", "Contenu vide : fournis le texte", "Plusieurs documents (a; b) : précise canvas_id.", "", "Aucun document partagé dans cette conversation"]) {
      expect(changedTheDocument({ name: "canvas_write", result })).toBe(false);
    }
    expect(changedTheDocument({ name: "canvas_read", result: "Document « L »…" })).toBe(false);
    expect(changedTheDocument({ name: "web_search", result: "ok" })).toBe(false);
  });

  it("change de signature à chaque modification, et seulement alors", () => {
    const first = [{ tools: [{ name: "canvas_write", result: "Document créé. version 1" }] }];
    const a = canvasActivity(first);
    expect(a.count).toBe(1);
    expect(canvasActivity([...first, { tools: [{ name: "canvas_read", result: "…" }] }]).key).toBe(a.key); // une lecture ne bouge rien
    const b = canvasActivity([...first, { tools: [{ name: "canvas_edit", result: "1 remplacement(s) effectué(s). version 2" }] }]);
    expect(b.count).toBe(2);
    expect(b.key).not.toBe(a.key);
    expect(canvasActivity([]).key).toBe("0:");
  });

  it("retrouve le document touché dans le résultat de l'outil", () => {
    const id = "3f2b8c1e-9a4d-4e57-8b6a-0c1d2e3f4a5b";
    const touched = canvasActivity([{ tools: [{ name: "canvas_write", result: `Document créé. Document « Lettre » (identifiant ${id}), version 1 : l'utilisateur le voit` }] }]);
    expect(touched.canvasId).toBe(id);
    expect(canvasActivity([{ tools: [{ name: "canvas_write", result: "Document créé sans identifiant lisible" }] }]).canvasId).toBeNull();
    expect(canvasActivity([]).canvasId).toBeNull();
  });
});

describe("parseConflict", () => {
  it("lit l'état courant d'un 409", () => {
    const current = doc({ version: 4, content: "Version de DONNA", updated_by: "donna" });
    expect(parseConflict({ detail: { message: "x", current_version: 4, updated_by: "donna", current } })).toEqual({ currentVersion: 4, updatedBy: "donna", current });
  });

  it("refuse tout ce qui ne ressemble pas à un conflit", () => {
    for (const body of [null, {}, { detail: "Document introuvable." }, { detail: { current_version: 2 } }, { detail: { current: { content: 3 }, current_version: 2 } }, "x"]) {
      expect(parseConflict(body)).toBeNull();
    }
  });
});

describe("éditeur", () => {
  it("passe à « à enregistrer » dès qu'on modifie, et revient à « enregistré » si on retape l'original", () => {
    let state = open();
    state = run([{ type: "edit", content: "Texte modifié" }], state);
    expect(state.status).toBe("dirty");
    state = run([{ type: "edit", content: "Texte" }], state);
    expect(state.status).toBe("saved");
    expect(run([{ type: "edit", title: "Autre" }], state).status).toBe("dirty");
  });

  it("n'écrase pas ce qui a été tapé pendant l'enregistrement", () => {
    let state = run([{ type: "load", doc: doc() }, { type: "edit", content: "A" }, { type: "saving" }]);
    expect(state.status).toBe("saving");
    state = run([{ type: "edit", content: "AB" }, { type: "saved", doc: doc({ version: 2, content: "A" }) }], state);
    expect(state).toMatchObject({ status: "dirty", content: "AB" });
    expect(state.doc?.version).toBe(2); // le prochain enregistrement se fonde sur la version 2
    expect(run([{ type: "saving" }, { type: "saved", doc: doc({ version: 3, content: "AB" }) }], state)).toMatchObject({ status: "saved", content: "AB" });
  });

  it("met à jour sans bruit quand DONNA modifie et qu'il n'y a rien d'en cours, en le signalant", () => {
    const state = run([{ type: "remote", doc: doc({ version: 2, content: "Réécrit par DONNA", updated_by: "donna" }) }], open());
    expect(state).toMatchObject({ status: "saved", content: "Réécrit par DONNA", updatedByDonna: true, conflict: null });
    expect(run([{ type: "dismissNotice" }], state).updatedByDonna).toBe(false);
    expect(run([{ type: "edit", content: "Réécrit par DONNA !" }], state).updatedByDonna).toBe(false); // dès qu'on tape, le bandeau s'efface
  });

  it("ne perd JAMAIS une saisie en cours quand le serveur change : conflit, brouillon gardé", () => {
    for (const status of ["dirty", "saving", "error"] as const) {
      let state = run([{ type: "load", doc: doc() }, { type: "edit", content: "Ma saisie" }]);
      if (status === "saving") state = run([{ type: "saving" }], state);
      if (status === "error") state = run([{ type: "saving" }, { type: "failed" }], state);
      expect(state.status).toBe(status);
      const after = run([{ type: "remote", doc: doc({ version: 2, content: "Celle de DONNA", updated_by: "donna" }) }], state);
      expect(after).toMatchObject({ status: "conflict", content: "Ma saisie" });
      expect(after.conflict).toMatchObject({ currentVersion: 2, updatedBy: "donna" });
    }
  });

  it("ignore une version qui n'est pas plus récente, et change de document sans conflit", () => {
    const state = run([{ type: "load", doc: doc({ version: 3 }) }, { type: "edit", content: "brouillon" }]);
    expect(run([{ type: "remote", doc: doc({ version: 3, content: "autre" }) }, { type: "remote", doc: doc({ version: 1 }) }], state)).toEqual(state);
    const other = run([{ type: "remote", doc: doc({ id: "c2", title: "Autre document", version: 1, content: "x" }) }], state);
    expect(other).toMatchObject({ status: "saved", title: "Autre document", content: "x" });
  });

  it("laisse choisir : prendre la version du serveur, ou garder la sienne SUR la version courante", () => {
    const conflicted = run([
      { type: "load", doc: doc() }, { type: "edit", content: "Ma saisie" },
      { type: "conflict", conflict: { currentVersion: 5, updatedBy: "donna", current: doc({ version: 5, content: "Celle de DONNA", updated_by: "donna" }) } },
    ]);
    expect(conflicted.status).toBe("conflict");
    expect(run([{ type: "edit", content: "Ma saisie, suite" }], conflicted)).toMatchObject({ status: "conflict", content: "Ma saisie, suite" }); // on peut continuer à taper
    const theirs = run([{ type: "takeTheirs" }], conflicted);
    expect(theirs).toMatchObject({ status: "saved", content: "Celle de DONNA", conflict: null, updatedByDonna: true });
    expect(theirs.doc?.version).toBe(5);
    const mine = run([{ type: "keepMine" }], conflicted);
    expect(mine).toMatchObject({ status: "dirty", content: "Ma saisie", conflict: null });
    expect(mine.doc?.version).toBe(5); // l'enregistrement qui suit se fonde sur la version courante : il passe, et l'autre version reste dans l'historique
    expect(mine.checkpoint).toBe(true); // …et le serveur ne fond pas cet enregistrement dans la version écartée
    // Une fois enregistré, les frappes suivantes redeviennent des enregistrements ordinaires (fondus entre eux).
    const saved = run([{ type: "saving" }, { type: "saved", doc: doc({ version: 6, content: "Ma saisie" }) }], mine);
    expect(saved).toMatchObject({ status: "saved", checkpoint: false });
    // Même en tapant encore PENDANT l'enregistrement du point de reprise : le suivant n'en est pas un.
    const typing = run([{ type: "saving" }, { type: "edit", content: "Ma saisie, suite" }, { type: "saved", doc: doc({ version: 6, content: "Ma saisie" }) }], mine);
    expect(typing).toMatchObject({ status: "dirty", checkpoint: false });
  });

  it("ne fait rien sans document, sans conflit, ou hors de son état", () => {
    expect(run([{ type: "edit", content: "x" }, { type: "saved", doc: doc() }])).toMatchObject({ doc: expect.anything() }); // « saved » sans document ouvert : état inchangé côté texte
    expect(run([{ type: "takeTheirs" }, { type: "keepMine" }], open())).toEqual(open());
    expect(run([{ type: "saving" }, { type: "failed" }], open()).status).toBe("saved"); // rien à enregistrer
    expect(run([{ type: "failed" }], run([{ type: "load", doc: doc() }, { type: "edit", content: "x" }])).status).toBe("dirty"); // un échec hors enregistrement n'invente pas d'erreur
  });

  it("se vide quand on change de conversation", () => {
    expect(run([{ type: "edit", content: "x" }, { type: "reset" }], open())).toEqual(emptyEditor);
  });

  it("repart d'un état propre quand on ouvre un document", () => {
    const state = run([{ type: "load", doc: doc() }, { type: "edit", content: "x" }, { type: "load", doc: doc({ id: "c9", title: "Neuf", content: "n" }) }]);
    expect(state).toMatchObject({ status: "saved", title: "Neuf", content: "n", conflict: null });
  });
});
