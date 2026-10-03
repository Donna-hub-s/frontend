// Formules dans les réponses : normalisation du texte AVANT remark-math.
//
// remark-math lit « $…$ » comme une formule : « ça coûte $5 et $10 » deviendrait « 5 et » en italique mathématique.
// Pour un assistant qui parle de factures et de budgets, c'est le cas courant, pas l'exception. On désactive donc la
// syntaxe à un seul dollar dans remark-math (singleDollarTextMath: false) et on ne garde comme formule que ce qui en
// est sans ambiguïté :
//   - \( … \)  et  \[ … \]   (la notation LaTeX que la plupart des modèles produisent) ;
//   - $$ … $$ ;
//   - $…$ seulement s'il contient du LaTeX (\commande, ^, _, { }) et n'a pas d'espace collé aux dollars :
//     « $x^2 + 1$ » est une formule, « $5 et $10 » ne l'est pas.
// Le code (blocs et `code en ligne`) n'est jamais touché.

const FENCE = /^( {0,3})(`{3,}|~{3,})/;
const LATEX_MARK = /[\\^_{}]/;

/** Découpe une ligne en segments de code en ligne (inchangés) et de texte (normalisés). */
function mapOutsideInlineCode(line: string, transform: (text: string) => string): string {
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, index) => (index % 2 === 1 ? part : transform(part)))
    .join("");
}

function normalizeText(text: string): string {
  return text
    .replace(/\\\(\s*(.+?)\s*\\\)/g, (_, inner: string) => `$$${inner}$$`)
    .replace(/\$(?!\$)([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\$)/g, (match, inner: string) => (LATEX_MARK.test(inner) ? `$$${inner}$$` : match));
}

/** Vrai si le texte contient de quoi activer le rendu des formules (évite de les charger pour rien). */
export const hasMath = (text: string): boolean => /\$\$|\\\(|\\\[|\$[^\s$][^$\n]*[\\^_{}][^$\n]*\$/.test(text);

export function normalizeMath(markdown: string): string {
  if (!hasMath(markdown)) return markdown;
  const lines = markdown.split("\n");
  const out: string[] = [];
  let fence: string | null = null; // marqueur du bloc de code ouvert (``` ou ~~~)
  let block: string[] | null = null; // contenu d'un \[ … \] qui s'étend sur plusieurs lignes

  for (const line of lines) {
    const match = FENCE.exec(line);
    if (fence === null && match) {
      fence = match[2];
      out.push(line);
      continue;
    }
    if (fence !== null) {
      if (match && match[2][0] === fence[0] && match[2].length >= fence.length && line.trim() === match[2]) fence = null;
      out.push(line);
      continue;
    }

    if (block !== null) {
      const end = line.indexOf("\\]");
      if (end === -1) {
        block.push(line);
        continue;
      }
      block.push(line.slice(0, end));
      out.push("$$", ...block.filter((l, i, all) => l.trim() !== "" || (i > 0 && i < all.length - 1)), "$$");
      block = null;
      const rest = line.slice(end + 2);
      if (rest.trim()) out.push(rest);
      continue;
    }

    // \[ … \] sur une seule ligne
    const single = /^(\s*)\\\[\s*(.+?)\s*\\\]\s*$/.exec(line);
    if (single) {
      out.push("$$", single[2], "$$");
      continue;
    }
    // \[ qui ouvre un bloc multi-ligne
    const open = /^\s*\\\[\s*(.*)$/.exec(line);
    if (open && !line.includes("\\]")) {
      block = open[1].trim() ? [open[1]] : [];
      continue;
    }
    out.push(mapOutsideInlineCode(line, normalizeText));
  }
  if (block !== null) out.push("\\[", ...block); // jamais fermé : on rend le texte tel quel
  return out.join("\n");
}
