import { describe, expect, it } from "vitest";
import { hrefBasename, imageTarget, inlineImageNames, isImageName, linkTarget } from "./file-links";

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

describe("isImageName", () => {
  it("accepte les images raster et refuse le SVG", () => {
    for (const name of ["a.png", "B.JPG", "c.jpeg", "d.webp", "e.gif"]) expect(isImageName(name)).toBe(true);
    for (const name of ["a.svg", "b.pdf", "c", "d.png.exe", ""]) expect(isImageName(name)).toBe(false);
  });
});

describe("imageTarget", () => {
  const graphique = { name: "graphique.png" };
  const synthese = { name: "synthese.csv" };

  it("affiche en ligne une pièce jointe image désignée par son nom", () => {
    expect(imageTarget("sandbox:/mnt/data/graphique.png", "Graphique", [graphique, synthese])).toEqual({ kind: "image", file: graphique });
    expect(imageTarget("graphique.png", "", [graphique])).toEqual({ kind: "image", file: graphique });
  });

  it("ne charge JAMAIS une image externe : lien seulement", () => {
    expect(imageTarget("https://evil.example/pixel.png?secret=abc", "x", [graphique])).toEqual({ kind: "link", href: "https://evil.example/pixel.png?secret=abc" });
    expect(imageTarget("https://evil.example/a.gif", "x", [])).toEqual({ kind: "link", href: "https://evil.example/a.gif" });
  });

  it("une pièce jointe qui n'est pas une image devient un lien de fichier", () => {
    expect(imageTarget("synthese.csv", "Tableau", [graphique, synthese])).toEqual({ kind: "file", file: synthese });
  });

  it("rien d'affichable : du texte", () => {
    expect(imageTarget("data:image/png;base64,AAAA", "x", [graphique])).toEqual({ kind: "text" });
    expect(imageTarget("javascript:alert(1)", "x", [])).toEqual({ kind: "text" });
    expect(imageTarget(undefined, "", [])).toEqual({ kind: "text" });
  });
});

describe("inlineImageNames", () => {
  const graphique = { name: "Graphique.png" };
  const autre = { name: "autre.png" };

  it("repère les pièces jointes déjà affichées par une image du texte", () => {
    const text = "Voici : ![Graphique](sandbox:/mnt/data/graphique.png) et ![x](https://evil.example/p.png) puis ![a](<autre.png>)";
    expect([...inlineImageNames(text, [graphique, autre])].sort()).toEqual(["autre.png", "graphique.png"]);
  });

  it("ignore le texte sans image, les liens simples et les fichiers inconnus", () => {
    expect(inlineImageNames("Un [lien](graphique.png) et du texte.", [graphique]).size).toBe(0);
    expect(inlineImageNames("![x](inconnu.png)", [graphique, autre]).size).toBe(0); // deux fichiers : aucune supposition
    expect([...inlineImageNames("![x](inconnu.png)", [graphique])]).toEqual(["graphique.png"]); // un seul de ce type : c'est lui, comme à l'affichage
    expect(inlineImageNames("", [graphique]).size).toBe(0);
  });
});
