import { describe, expect, it } from "vitest";
import { hrefBasename, linkTarget } from "./file-links";

const rapport = { name: "Rapport d'audit.pdf" };
const budget = { name: "Budget 2026.xlsx" };

describe("hrefBasename", () => {
  it("garde le nom de fichier d'un chemin sandbox, relatif ou absolu", () => {
    expect(hrefBasename("sandbox:/mnt/data/Rapport%20d'audit.pdf")).toBe("Rapport d'audit.pdf");
    expect(hrefBasename("/download/Rapport.pdf?x=1#p2")).toBe("Rapport.pdf");
    expect(hrefBasename("https://exemple.fr/a/b/c.docx")).toBe("c.docx");
    expect(hrefBasename("Rapport.pdf")).toBe("Rapport.pdf");
  });

  it("ne lève pas sur un « % » isolé", () => {
    expect(hrefBasename("sandbox:/x/100%.pdf")).toBe("100%.pdf");
  });
});

describe("linkTarget", () => {
  it("rattache un lien sandbox: au fichier joint du même nom", () => {
    expect(linkTarget("sandbox:/mnt/data/Rapport%20d'audit.pdf", "Télécharger", [rapport, budget])).toEqual({ kind: "file", file: rapport });
  });

  it("ignore la casse et la forme Unicode du nom", () => {
    const accent = { name: "Compte rendu é.docx" };
    expect(linkTarget("/files/compte rendu é.DOCX", "x", [accent])).toEqual({ kind: "file", file: accent });
  });

  it("rattache un lien relatif ou http au fichier joint du même nom", () => {
    expect(linkTarget("/download/Budget%202026.xlsx", "Budget", [rapport, budget])).toEqual({ kind: "file", file: budget });
    expect(linkTarget("https://donna.example/dl/Budget%202026.xlsx", "Budget", [budget])).toEqual({ kind: "file", file: budget });
  });

  it("garde un vrai lien externe quand rien ne correspond", () => {
    expect(linkTarget("https://exemple.fr/doc", "Doc", [rapport])).toEqual({ kind: "external", href: "https://exemple.fr/doc" });
    expect(linkTarget("mailto:a@b.fr", "écrire", [])).toEqual({ kind: "external", href: "mailto:a@b.fr" });
    expect(linkTarget("https://exemple.fr/doc", "Doc", [])).toEqual({ kind: "external", href: "https://exemple.fr/doc" });
  });

  it("utilise le texte du lien quand la cible est vide (sandbox: blanchi)", () => {
    expect(linkTarget("", "Télécharger Rapport d'audit.pdf", [rapport, budget])).toEqual({ kind: "file", file: rapport });
    expect(linkTarget(undefined, "Budget 2026.xlsx", [rapport, budget])).toEqual({ kind: "file", file: budget });
  });

  it("devine l'unique fichier joint quand le nom est inventé mais le type identique", () => {
    expect(linkTarget("sandbox:/mnt/data/rapport_final.pdf", "Télécharger le PDF", [rapport])).toEqual({ kind: "file", file: rapport });
  });

  it("ne devine pas : plusieurs fichiers, ou type différent, ou lien externe", () => {
    expect(linkTarget("sandbox:/mnt/data/autre.pdf", "PDF", [rapport, { name: "Autre rapport.pdf" }])).toEqual({ kind: "text" });
    expect(linkTarget("sandbox:/mnt/data/autre.docx", "Word", [rapport])).toEqual({ kind: "text" });
    expect(linkTarget("https://exemple.fr/autre.pdf", "PDF", [rapport])).toEqual({ kind: "external", href: "https://exemple.fr/autre.pdf" });
  });

  it("n'en fait jamais un lien cliquable sans correspondance : pas de page de l'application", () => {
    expect(linkTarget("sandbox:/mnt/data/x.pdf", "x", [])).toEqual({ kind: "text" });
    expect(linkTarget("/download/x.pdf", "x", [])).toEqual({ kind: "text" });
    expect(linkTarget("", "x", [])).toEqual({ kind: "text" });
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>1</script>", "file:///etc/passwd", "vbscript:x", " JaVaScRiPt:alert(1)"])(
    "refuse le schéma dangereux %s",
    (href) => {
      expect(linkTarget(href, "clic", [rapport])).toEqual({ kind: "text" });
    },
  );
});
