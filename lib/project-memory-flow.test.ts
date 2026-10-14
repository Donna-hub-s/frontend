// Mémoire de projet dans le chat (plan-memoire-projet-droits-quotas.md, phase 1) côté interface : l'étape « Mémoire » dit qu'il s'agit du
// projet, la réponse dit pour qui un fait a été retenu, et l'historique sait ce que DONNA a écrit.
import { describe, expect, it } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import { stepDetail } from "@/components/workspace/side-panel";
import { applyPrepStep } from "./chat-run";
import { readChatStream, type StreamEvent } from "./chat-stream";
import type { Step } from "./workspace-types";

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

async function events(body: string): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const event of readChatStream(new Response(body))) out.push(event);
  return out;
}

describe("étape « Mémoire »", () => {
  it("garde le projet quand la mémoire est celle du projet", () => {
    const steps = applyPrepStep([], { key: "memory", status: "done", facts: 3, scope: "project", name: "Audit 2026" }, 1);
    expect(steps[0].data).toEqual({ kind: "memory", facts: 3, scope: "project", name: "Audit 2026" });
  });

  it("reste la mémoire personnelle sans portée", () => {
    const steps = applyPrepStep([], { key: "memory", status: "done", facts: 2 }, 1);
    expect(steps[0].data).toEqual({ kind: "memory", facts: 2 });
  });

  it("le panneau dit « Mémoire du projet » avec son nom, sinon le libellé personnel", () => {
    const project = applyPrepStep([], { key: "memory", status: "done", facts: 3, scope: "project", name: "Audit 2026" }, 1)[0] as Step;
    const personal = applyPrepStep([], { key: "memory", status: "done", facts: 2 }, 1)[0] as Step;
    expect(stepDetail(fr.workspace, project)?.text).toBe("Mémoire du projet « Audit 2026 » : 3 fait(s)");
    expect(stepDetail(fr.workspace, personal)?.text).toBe("2 fait(s) pris en compte");
  });
});

describe("fin de réponse", () => {
  it("porte la portée de la mémoire quand les faits ont été retenus pour le projet", async () => {
    const [done] = await events(sse("done", { sources: [], memory_notes: ["Le client clôture au 31 mars."], memory_scope: "project", attachments: [] }));
    expect(done).toMatchObject({ type: "done", memory: ["Le client clôture au 31 mars."], memoryScope: "project" });
  });

  it("n'invente aucune portée sans la mémoire de projet (ancien serveur, hors projet)", async () => {
    const [plain] = await events(sse("done", { sources: [], memory_notes: ["Préfère le matin"], attachments: [] }));
    const [other] = await events(sse("done", { sources: [], memory_notes: [], memory_scope: "n'importe quoi", attachments: [] }));
    expect((plain as { memoryScope?: string }).memoryScope).toBeUndefined();
    expect((other as { memoryScope?: string }).memoryScope).toBeUndefined();
  });
});

describe("libellés", () => {
  it("existent dans les deux langues", async () => {
    const en = (await import("@/app/[lang]/dictionaries/en.json")).default;
    for (const dict of [fr, en]) {
      expect(dict.workspace.chat.memoryProject).toBeTruthy();
      expect(dict.workspace.chat.memoryProjectFacts).toContain("{name}");
      expect(dict.workspace.projects.factByDonna).toBeTruthy();
      expect(dict.workspace.projects.memoryViewerHint).toBeTruthy();
    }
  });
});

describe("appels de mémoire qui deviennent des propositions", async () => {
  const { isProposalCall } = await import("./chat-run");
  const FACT_ID = "11111111-2222-3333-4444-555555555555";

  it("un appel de mémoire direct n'est pas une proposition, même si son résultat porte un identifiant de fait", () => {
    expect(isProposalCall("remember_fact", `Fait enregistré dans la mémoire du projet [${FACT_ID}] : tous les membres le verront.`)).toBe(false);
    expect(isProposalCall("remember_fact", "Fait enregistré.")).toBe(false);
    expect(isProposalCall("forget_fact", "Fait oublié : retiré de la mémoire du projet (l'historique garde la trace).")).toBe(false);
  });

  it("sous la politique d'approbation, le résultat porte « (action <id>) » : c'est une proposition à valider", () => {
    for (const name of ["remember_fact", "update_fact", "forget_fact"]) {
      expect(isProposalCall(name, `Écriture dans la mémoire du projet PROPOSÉE (action ${FACT_ID}) : la politique du projet veut l'accord de l'utilisateur.`)).toBe(true);
    }
  });

  it("les outils de proposition habituels le restent, et un autre outil ne le devient jamais", () => {
    expect(isProposalCall("propose_email", "Brouillon préparé")).toBe(true);
    expect(isProposalCall("search_documents", `(action ${FACT_ID})`)).toBe(false);
  });
});

describe("mémoire coupée par la limite relue à chaque message", () => {
  it("l'étape le dit et passe en alerte, au lieu de laisser croire que tout est chargé", () => {
    const step = applyPrepStep([], { key: "memory", status: "done", facts: 10, scope: "project", name: "Audit", omitted: 4 }, 1)[0] as Step;
    expect(step.data).toEqual({ kind: "memory", facts: 10, scope: "project", name: "Audit", omitted: 4 });
    expect(stepDetail(fr.workspace, step)).toEqual({ text: "Mémoire du projet « Audit » : 10 fait(s) — 4 plus ancien(s) non chargé(s) : limite atteinte", warn: true });
  });

  it("n'ajoute rien quand tout est chargé", () => {
    const step = applyPrepStep([], { key: "memory", status: "done", facts: 10, scope: "project", name: "Audit", omitted: 0 }, 1)[0] as Step;
    expect(stepDetail(fr.workspace, step)).toEqual({ text: "Mémoire du projet « Audit » : 10 fait(s)", warn: false });
  });
});
