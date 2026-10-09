/**
 * Le bloc « À brancher » de l'accueil : quels services Google n'ont pas encore été autorisés.
 *
 * Depuis que la connexion Google ne demande plus que l'identité, un compte neuf n'a ni Gmail, ni Agenda, ni Drive — et rien sur
 * l'accueil ne le disait : il fallait deviner le point rouge de « Connecteurs ». Le plan (2.2) prévoyait « ce qui n'est pas branché ».
 */

import type { GoogleService } from "./oauth-link";
import type { ConnectorsOut } from "./workspace-types";

const ORDER: readonly GoogleService[] = ["gmail", "calendar", "drive"];

/** Les services Google que l'utilisateur n'a pas autorisés, dans l'ordre d'affichage. Vide si l'état est inconnu (API injoignable) : on ne dit pas « à brancher » sans savoir. */
export function missingGoogleServices(google: ConnectorsOut["google"] | null | undefined): GoogleService[] {
  if (!google) return [];
  return ORDER.filter((service) => !google[service]);
}

/**
 * Un indicateur booléen mémorisé dans le navigateur (« j'ai masqué ce bloc »), lisible par `useSyncExternalStore`.
 *
 * Confort propre à CE navigateur, pas un réglage : il ne suit pas l'utilisateur d'un appareil à l'autre. Si le stockage est interdit
 * ou plein (navigation privée…), l'indicateur tient le temps de la page plutôt que de ne rien faire — masquer doit toujours marcher.
 */
export function createFlagStore(key: string) {
  const listeners = new Set<() => void>();
  let inMemory = false;

  const read = (): boolean => {
    if (inMemory) return true;
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  };

  return {
    read,
    set() {
      inMemory = true; // vaut même si l'écriture échoue
      try {
        window.localStorage.setItem(key, "1");
      } catch {
        // stockage indisponible : l'indicateur ne vit que dans cette page
      }
      listeners.forEach((notify) => notify());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      window.addEventListener("storage", listener); // un autre onglet l'a masqué
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", listener);
      };
    },
  };
}

/** « Masquer » du bloc de l'accueil. Les connecteurs restent dans le panneau latéral et les Réglages. */
export const homeConnectorsHidden = createFlagStore("donna.home.connectors.hidden");
