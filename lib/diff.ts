// Différences ligne à ligne entre deux textes — pour montrer ce que DONNA (ou l'utilisateur) a changé dans un document partagé.
// Pur et borné : un préfixe et un suffixe communs sont écartés d'abord (une retouche ne coûte presque rien), et au-delà d'une taille
// de table raisonnable le milieu est présenté en bloc (tout retiré, tout ajouté) plutôt que de figer l'onglet.

export type DiffLine = { kind: "same" | "add" | "del"; text: string };
export type FoldedDiff = DiffLine | { kind: "gap"; count: number };

const MAX_TABLE_CELLS = 4_000_000;

const split = (text: string): string[] => (text === "" ? [] : text.split("\n"));

export function diffLines(before: string, after: string): DiffLine[] {
  const a = split(before);
  const b = split(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head = a.slice(0, start).map((text): DiffLine => ({ kind: "same", text }));
  const tail = a.slice(endA).map((text): DiffLine => ({ kind: "same", text }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  return [...head, ...diffMiddle(midA, midB), ...tail];
}

function diffMiddle(a: string[], b: string[]): DiffLine[] {
  if (a.length === 0) return b.map((text) => ({ kind: "add", text }));
  if (b.length === 0) return a.map((text) => ({ kind: "del", text }));
  if ((a.length + 1) * (b.length + 1) > MAX_TABLE_CELLS) {
    return [...a.map((text): DiffLine => ({ kind: "del", text })), ...b.map((text): DiffLine => ({ kind: "add", text }))];
  }
  // Plus longue sous-suite commune : table des longueurs depuis la fin, puis parcours.
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      out.push({ kind: "del", text: a[i++] });
    } else {
      out.push({ kind: "add", text: b[j++] });
    }
  }
  while (i < a.length) out.push({ kind: "del", text: a[i++] });
  while (j < b.length) out.push({ kind: "add", text: b[j++] });
  return out;
}

export const diffStats = (lines: DiffLine[]): { added: number; removed: number } => ({
  added: lines.filter((line) => line.kind === "add").length,
  removed: lines.filter((line) => line.kind === "del").length,
});

/** Replie les longues séries de lignes inchangées (`context` lignes gardées de chaque côté d'un changement). */
export function foldUnchanged(lines: DiffLine[], context = 2): FoldedDiff[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++) keep[k] = true;
  });
  const out: FoldedDiff[] = [];
  let hidden = 0;
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (hidden) out.push({ kind: "gap", count: hidden });
      hidden = 0;
      out.push(line);
    } else {
      hidden++;
    }
  });
  if (hidden) out.push({ kind: "gap", count: hidden });
  return out;
}
