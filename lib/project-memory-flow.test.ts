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
