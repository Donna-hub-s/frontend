// Détecte les URL http(s) dans un texte brut (message utilisateur, jamais passé par
// react-markdown) pour les rendre cliquables sans jamais construire de HTML — les segments
// sont consommés par React (voir conversation.tsx::UserMessage), jamais dangerouslySetInnerHTML.

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/** Retire la ponctuation de fin de phrase qui suit souvent un lien collé dans le texte
 * (« regarde ce site https://x.com, c'est bien » → la virgule n'est pas dans l'URL). Une
 * parenthèse/crochet fermant qui ÉQUILIBRE une ouverture dans l'URL reste, lui, à l'intérieur
 * (ex. une URL Wikipédia en « (homonymie) »). */
function stripTrailingPunctuation(url: string): string {
  const PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  while (url.length > 0) {
    const last = url[url.length - 1];
    const open = PAIRS[last];
    if (open) {
      const opens = url.split(open).length - 1;
      const closes = url.split(last).length - 1;
      if (closes <= opens) break;
      url = url.slice(0, -1);
      continue;
    }
    if (".,;:!?'\"»".includes(last)) {
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return url;
}

export type TextSegment = { type: "text"; value: string } | { type: "link"; href: string };

/** Découpe `text` en segments texte/lien, dans l'ordre. Un texte sans URL renvoie un seul
 * segment texte (jamais un tableau vide, même pour une chaîne vide — simplifie le rendu). */
export function splitLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const url = stripTrailingPunctuation(match[0]);
    if (!url) continue;
    if (start > lastIndex) segments.push({ type: "text", value: text.slice(lastIndex, start) });
    segments.push({ type: "link", href: url });
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length || segments.length === 0) segments.push({ type: "text", value: text.slice(lastIndex) });
  return segments;
}
