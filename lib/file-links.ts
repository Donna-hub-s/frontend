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
