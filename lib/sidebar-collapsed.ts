// Barre latérale rétractée en rail d'icônes : un choix d'interface qui doit survivre au rechargement,
// donc gardé dans `localStorage` — que le rendu serveur, lui, ne peut pas connaître.
//
// Un store externe (`useSyncExternalStore`) plutôt qu'un `useState` + effet : React lit l'instantané du
// SERVEUR (déployée) au rendu serveur et celui du navigateur après hydratation, sans rendu en cascade ni
// divergence d'hydratation. Effet de bord utile : deux onglets du même espace de travail restent d'accord.

const KEY = "donna:sidebar-collapsed";

const listeners = new Set<() => void>();
/** `getSnapshot` doit rendre la MÊME valeur tant que rien n'a changé, sinon React boucle : on mémorise
 * plutôt que de relire `localStorage` à chaque appel. */
let cached: boolean | null = null;

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // stockage refusé (navigation privée, réglage strict) : barre déployée
  }
}

const notify = () => {
  for (const listener of listeners) listener();
};

/** `key === null` : le stockage a été vidé en bloc. */
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== KEY) return;
  cached = read();
  notify();
}

export function subscribeCollapsed(onChange: () => void): () => void {
  if (!listeners.size) window.addEventListener("storage", onStorage);
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

export function collapsedSnapshot(): boolean {
  cached ??= read();
  return cached;
}

/** Au rendu serveur, le choix est inconnu : la barre est déployée (et se rétracte à l'hydratation). */
export const collapsedServerSnapshot = (): boolean => false;

export function toggleCollapsed(): void {
  cached = !collapsedSnapshot();
  try {
    localStorage.setItem(KEY, cached ? "1" : "0");
  } catch {
    // Le choix ne survivra pas au rechargement, mais il s'applique tout de suite.
  }
  notify();
}

/** Tests seulement : repart d'un store vide (le cache est un module, il survit sinon d'un test à l'autre). */
export function resetCollapsedForTests(): void {
  cached = null;
  listeners.clear();
}
