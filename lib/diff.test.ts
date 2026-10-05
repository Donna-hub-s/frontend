import { describe, expect, it } from "vitest";
import { diffLines, diffStats, foldUnchanged } from "./diff";

const kinds = (lines: ReturnType<typeof diffLines>) => lines.map((l) => `${l.kind === "same" ? " " : l.kind === "add" ? "+" : "-"}${l.text}`);

describe("diffLines", () => {
  it("ne signale rien entre deux textes identiques, ni entre deux textes vides", () => {
    expect(kinds(diffLines("a\nb", "a\nb"))).toEqual([" a", " b"]);
    expect(diffLines("", "")).toEqual([]);
  });

  it("montre une ligne modifiée comme retirée puis ajoutée, le reste inchangé", () => {
    expect(kinds(diffLines("un\ndeux\ntrois", "un\n2\ntrois"))).toEqual([" un", "-deux", "+2", " trois"]);
  });

  it("gère l'ajout et le retrait de lignes, au début, au milieu et à la fin", () => {
    expect(kinds(diffLines("b\nc", "a\nb\nc\nd"))).toEqual(["+a", " b", " c", "+d"]);
    expect(kinds(diffLines("a\nb\nc\nd", "b\nc"))).toEqual(["-a", " b", " c", "-d"]);
    expect(kinds(diffLines("", "nouveau\ntexte"))).toEqual(["+nouveau", "+texte"]);
    expect(kinds(diffLines("tout\nretiré", ""))).toEqual(["-tout", "-retiré"]);
  });

  it("garde l'ordre des lignes communes quand des lignes sont déplacées", () => {
    const lines = diffLines("a\nb\nc\nd\ne", "a\nd\nb\nc\ne");
    expect(lines.filter((l) => l.kind === "same").map((l) => l.text)).toEqual(["a", "b", "c", "e"]);
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1 });
    // Rejouer le diff redonne les deux textes d'origine.
    expect(lines.filter((l) => l.kind !== "add").map((l) => l.text).join("\n")).toBe("a\nb\nc\nd\ne");
    expect(lines.filter((l) => l.kind !== "del").map((l) => l.text).join("\n")).toBe("a\nd\nb\nc\ne");
  });

  it("traite les lignes vides comme des lignes", () => {
    expect(kinds(diffLines("a\n\nb", "a\n\n\nb"))).toEqual([" a", " ", "+", " b"]);
  });

  it("reste utilisable sur de gros textes : une retouche locale ne coûte presque rien, un remaniement total est présenté en bloc", () => {
    const big = Array.from({ length: 20_000 }, (_, i) => `ligne ${i}`);
    const edited = [...big];
    edited[10_000] = "modifiée";
    const started = Date.now();
    const lines = diffLines(big.join("\n"), edited.join("\n"));
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1 });
    const other = Array.from({ length: 5_000 }, (_, i) => `autre ${i}`);
    const total = diffLines(big.slice(0, 5_000).join("\n"), other.join("\n"));
    expect(diffStats(total)).toEqual({ added: 5_000, removed: 5_000 }); // au-delà de la taille bornée : tout retiré, tout ajouté
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});

describe("foldUnchanged", () => {
  it("replie les longues séries inchangées en gardant un peu de contexte autour de chaque changement", () => {
    const before = Array.from({ length: 30 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l15", "L15");
    const folded = foldUnchanged(diffLines(before, after), 2);
    expect(folded[0]).toEqual({ kind: "gap", count: 13 });
    expect(folded.filter((l) => l.kind !== "gap").map((l) => (l as { text: string }).text)).toEqual(["l13", "l14", "l15", "L15", "l16", "l17"]);
    expect(folded.at(-1)).toEqual({ kind: "gap", count: 12 });
  });

  it("ne replie rien quand il n'y a rien à replier, et tout quand rien n'a changé", () => {
    expect(foldUnchanged(diffLines("a\nb", "a\nc"))).toHaveLength(3);
    expect(foldUnchanged(diffLines("a\nb\nc", "a\nb\nc"))).toEqual([{ kind: "gap", count: 3 }]);
    expect(foldUnchanged([])).toEqual([]);
  });
});
