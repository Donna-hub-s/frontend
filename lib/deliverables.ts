// « Mes livrables » — GET /app/chat/deliverables (backend/app/chat/src/routes/deliverables_routes.py).
// Le serveur ne renvoie que des métadonnées et seulement ce qui appartient à l'utilisateur du jeton ; le téléchargement passe
// par la route des pièces jointes, qui revérifie le propriétaire. Ici : de la logique pure (testée), rien de plus.

export type DeliverableKind = "document" | "image";
export type KindFilter = "all" | DeliverableKind;

export type DeliverableFile = {
  id: string;
  name: string;
  kind: string;
  mime_type: string;
  conversation_id: string;
  conversation_title: string;
  created_at: string;
  /** Faux : produit dans une version abandonnée de la conversation. */
  on_shown_branch: boolean;
};

export type DeliverableCanvas = {
  id: string;
  title: string;
  conversation_id: string;
  conversation_title: string;
  version: number;
  /** « user » ou « donna » : qui a fait la dernière modification. */
  updated_by: string;
  updated_at: string;
};

export type Deliverables = {
  total: number;
  limit: number;
  offset: number;
  files: DeliverableFile[];
  canvases: DeliverableCanvas[];
};

export const PAGE_SIZE = 30;
export const SEARCH_DEBOUNCE_MS = 300;

export type Query = { q: string; kind: KindFilter; abandoned: boolean; offset?: number; limit?: number };

/** URL de la liste : les filtres vides ne partent pas, tout est encodé (un nom de fichier peut contenir n'importe quoi). */
export function deliverablesUrl({ q, kind, abandoned, offset = 0, limit = PAGE_SIZE }: Query): string {
  const params = new URLSearchParams();
  const needle = q.trim();
  if (needle) params.set("q", needle);
  if (kind !== "all") params.set("kind", kind);
  if (abandoned) params.set("abandoned", "true");
  if (offset > 0) params.set("offset", String(offset));
  params.set("limit", String(limit));
  return `/api/donna/chat/deliverables?${params.toString()}`;
}

/** Identité d'une recherche : un résultat tardif d'une recherche précédente ne doit jamais s'afficher à sa place. */
export const queryKey = ({ q, kind, abandoned }: Pick<Query, "q" | "kind" | "abandoned">): string => JSON.stringify([q.trim(), kind, abandoned]);

export const fileUrl = (id: string): string => `/api/donna/chat/attachments/${encodeURIComponent(id)}/file`;
export const conversationHref = (lang: string, id: string): string => `/${lang}/app/c/${encodeURIComponent(id)}`;

/** Reste-t-il des fichiers à charger ? (`loaded` = ce que la page affiche déjà, après fusion.) */
export const hasMore = (total: number, loaded: number): boolean => loaded < total;

/** Ajoute une page à ce qui est affiché sans doublon : si DONNA produit un fichier entre deux pages, tout se décale d'un cran et la
 *  dernière ligne de la page précédente reviendrait en tête de la suivante. L'ordre du serveur est conservé. */
export function mergePages(shown: DeliverableFile[], next: DeliverableFile[]): DeliverableFile[] {
  const seen = new Set(shown.map((file) => file.id));
  const added: DeliverableFile[] = [];
  for (const file of next) {
    if (seen.has(file.id)) continue;
    seen.add(file.id); // aussi à l'intérieur de la page : un identifiant n'apparaît jamais deux fois
    added.push(file);
  }
  return [...shown, ...added];
}

/** Extension en capitales (« PDF », « XLSX »), vide si le nom n'en a pas — un fichier caché « .env » n'a pas d'extension. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toUpperCase().slice(0, 5);
}
