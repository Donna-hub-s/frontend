// Sources montrées sous une réponse : les passages de documents réellement lus.
import type { SourceOut } from "@/lib/api";

/** Un passage par extrait distinct (même document plusieurs fois = plusieurs extraits = plusieurs cartes), et rien sans extrait :
 * une « source » sans texte n'est pas une citation. C'était un fichier produit par DONNA (déjà dans « Fichiers » sous la
 * réponse) — les messages enregistrés avant le correctif de l'API en portent encore, d'où le filtre aussi ici. */
export function visibleSources(sources: readonly SourceOut[] | null | undefined): SourceOut[] {
  return (sources ?? []).filter(
    (source, index, all) => source.excerpt.trim() !== "" && all.findIndex((other) => other.doc_id === source.doc_id && other.excerpt === source.excerpt) === index,
  );
}
