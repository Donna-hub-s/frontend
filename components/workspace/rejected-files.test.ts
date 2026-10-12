// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import { RejectedFiles } from "./rejected-files";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

async function mount(files: { name: string; reason?: string }[]) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(RejectedFiles, { intro: fr.workspace.projects.uploadErrorSome, files }));
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("RejectedFiles", () => {
  it("montre, pour chaque fichier refusé, la raison que donne le serveur", async () => {
    await mount([
      { name: "contrat-scanne.pdf", reason: "Aucun texte à indexer : ce PDF est probablement un scan." },
      { name: "protege.pdf", reason: "PDF protégé par un mot de passe : retirez la protection." },
    ]);

    const items = [...host.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toEqual([
      "contrat-scanne.pdf — Aucun texte à indexer : ce PDF est probablement un scan.",
      "protege.pdf — PDF protégé par un mot de passe : retirez la protection.",
    ]);
    expect(host.textContent).toContain("Ces fichiers n'ont pas été ajoutés");
  });

  it("garde le nom seul quand aucune raison n'est connue (réseau coupé, requête trop grosse)", async () => {
    await mount([{ name: "gros.pdf" }]);
    expect(host.querySelector("li")?.textContent).toBe("gros.pdf");
  });
});
