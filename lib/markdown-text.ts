// Petits utilitaires sur l'arbre hast que react-markdown fournit aux composants.

type HastNode = { type?: string; value?: string; tagName?: string; properties?: { className?: unknown }; children?: HastNode[] };

/** Texte brut d'un nœud hast (le contenu d'un bloc de code, pour le bouton « copier »). */
export function nodeText(node: unknown): string {
  const hast = node as HastNode | undefined;
  if (!hast) return "";
  if (typeof hast.value === "string") return hast.value;
  return (hast.children ?? []).map(nodeText).join("");
}

/** Langage d'un bloc de code (« language-python » → « python »), ou null. */
export function codeLanguage(node: unknown): string | null {
  const pre = node as HastNode | undefined;
  const code = pre?.children?.find((child) => child.tagName === "code");
  const classes = code?.properties?.className;
  const list = Array.isArray(classes) ? classes : typeof classes === "string" ? classes.split(/\s+/) : [];
  const found = list.map(String).find((name) => name.startsWith("language-"));
  return found ? found.slice("language-".length) || null : null;
}
