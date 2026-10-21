// @vitest-environment jsdom
// Phase 5 frontend : le contexte de WorkspaceProvider était unique — `threads`/`activity`
// (les seuls champs qui changent à chaque jeton du flux SSE, lib/chat-run.ts) vivaient dans la
// MÊME valeur mémoïsée que les 41 autres champs (projets, actions en attente, skills…), qui ne
// changent jamais pendant un streaming. Comme le `useMemo` dépendait de `threads`, il recalculait
// — et donc re-rendait TOUS les consommateurs de `useWorkspace()` (14 fichiers) — à chaque jeton.
// Ce test prouve que la scission (useWorkspace / useThreadsState) règle vraiment ça : un
// consommateur qui ne lit que des champs stables ne se re-rend plus quand `threads` change.
import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useThreadsState, useWorkspace, WorkspaceProvider } from "./workspace-provider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

// Compteur de rendus par ref, mutée et lue PENDANT le rendu : volontaire dans ce harnais de test
// (c'est la mesure elle-même), jamais un patron à suivre pour du code applicatif — d'où les
// dérogations ciblées à react-hooks/refs ci-dessous.

/** Ne lit QUE des champs stables (`conversations`) — ne doit jamais se re-rendre quand `threads` change. */
function StableConsumer() {
  const { conversations } = useWorkspace();
  const count = useRef(0);
  // eslint-disable-next-line react-hooks/refs -- compteur de rendus, voir note au-dessus.
  count.current += 1;
  // eslint-disable-next-line react-hooks/refs -- idem.
  return createElement("span", { "data-testid": "stable-count", "data-count": count.current }, conversations.length);
}

/** Lit `threads` — se re-rend normalement à chaque mutation, comme avant la scission. */
function ThreadsConsumer() {
  const { threads } = useThreadsState();
  const count = useRef(0);
  // eslint-disable-next-line react-hooks/refs -- compteur de rendus, voir note au-dessus.
  count.current += 1;
  // eslint-disable-next-line react-hooks/refs -- idem.
  return createElement("span", { "data-testid": "threads-count", "data-count": count.current }, Object.keys(threads).length);
}

/** Déclenche, depuis l'extérieur, exactement la mutation qu'un jeton de streaming produit
 * (`registerThread` + `patchMessage`, exposées par `useWorkspace()`, déjà utilisées par
 * `send`/les callbacks de `lib/chat-run.ts` pour alimenter `threads`). */
function Driver() {
  const { registerThread, patchMessage } = useWorkspace();
  return createElement(
    "div",
    null,
    createElement(
      "button",
      {
        type: "button",
        "data-testid": "register",
        onClick: () => registerThread("k1", null, [{ id: "m1", role: "assistant", content: "", createdAt: 0, attachments: [] }]),
      },
      "register",
    ),
    createElement(
      "button",
      {
        type: "button",
        "data-testid": "register-many",
        onClick: () => {
          for (let i = 1; i <= 35; i += 1) {
            registerThread(`k-${i}`, null, [{ id: `m-${i}`, role: "assistant", content: "", createdAt: 0, attachments: [] }]);
          }
        },
      },
      "register-many",
    ),
    createElement(
      "button",
      {
        type: "button",
        "data-testid": "patch",
        onClick: () => patchMessage("k1", "m1", { content: "jeton" }),
      },
      "patch",
    ),
  );
}

const mount = () => {
  act(() => {
    root.render(
      // WorkspaceProvider type `children` comme un champ requis (pas une signature avec enfants en
      // paramètres variadiques) : TS exige donc `children` dans les props elles-mêmes.
      // eslint-disable-next-line react/no-children-prop
      createElement(WorkspaceProvider, {
        initialConversations: [],
        initialPending: [],
        initialProjects: [],
        children: [createElement(Driver, { key: "driver" }), createElement(StableConsumer, { key: "stable" }), createElement(ThreadsConsumer, { key: "threads" })],
      }),
    );
  });
};

const countOf = (testId: string) => Number(host.querySelector(`[data-testid="${testId}"]`)?.getAttribute("data-count"));
const click = (testId: string) => act(() => (host.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click());

describe("WorkspaceProvider — contexte scindé (threads/activity à part)", () => {
  it("une mutation de threads (registerThread) ne re-rend PAS un consommateur qui ne lit que des champs stables", () => {
    mount();
    const stableBefore = countOf("stable-count");
    click("register");
    expect(countOf("stable-count")).toBe(stableBefore);
    expect(countOf("threads-count")).toBeGreaterThan(1);
  });

  it("une mutation de threads (patchMessage, comme un jeton SSE) ne re-rend toujours pas le consommateur stable", () => {
    mount();
    click("register");
    const stableAfterRegister = countOf("stable-count");
    const threadsAfterRegister = countOf("threads-count");
    click("patch");
    expect(countOf("stable-count")).toBe(stableAfterRegister);
    expect(countOf("threads-count")).toBeGreaterThan(threadsAfterRegister);
  });

  it("borne le nombre de fils en mémoire à 30 maximum", () => {
    mount();
    click("register-many");
    const threadsCountNode = host.querySelector('[data-testid="threads-count"]');
    expect(Number(threadsCountNode?.textContent)).toBe(30);
  });
});
