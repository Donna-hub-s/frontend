// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import { OAuthLinkNotice } from "./oauth-link-notice";

const labels = fr.workspace.oauthLink;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

/** Monte l'avis sur l'adresse donnée (comme après le retour de xauth) et laisse passer les microtâches de l'effet. */
async function mountAt(address: string) {
  window.history.replaceState(null, "", address);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(OAuthLinkNotice, { labels }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("OAuthLinkNotice", () => {
  it("confirme une liaison réussie puis nettoie l'adresse sans toucher au reste", async () => {
    await mountAt("/fr/app?linked=google&project=abc");

    const notice = host.querySelector('[role="status"]');
    expect(notice?.textContent).toContain("Google est relié à votre compte.");
    expect(window.location.search).toBe("?project=abc");
  });

  it("se retire seule après une liaison réussie", async () => {
    await mountAt("/fr/app?linked=google");
    expect(host.querySelector('[role="status"]')).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it("garde un échec affiché jusqu'à ce qu'on le ferme", async () => {
    await mountAt("/fr/app?link_error=already_linked");

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("déjà relié à un autre utilisateur");
    expect(window.location.search).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(host.querySelector('[role="alert"]')).not.toBeNull();

    await act(async () => {
      host.querySelector<HTMLButtonElement>(`button[aria-label="${labels.dismiss}"]`)?.click();
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("n'affiche jamais un texte forgé dans l'adresse", async () => {
    await mountAt("/fr/app?link_error=%3Cb%3EVirement+urgent%3C%2Fb%3E");

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(labels.errors.generic);
    expect(host.textContent).not.toContain("Virement");
  });

  it("ne montre rien quand l'adresse ne porte aucun retour de liaison", async () => {
    await mountAt("/fr/app?project=abc");

    expect(host.querySelector('[role="status"], [role="alert"]')).toBeNull();
    expect(window.location.search).toBe("?project=abc");
  });
});
