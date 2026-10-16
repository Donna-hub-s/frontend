// @vitest-environment jsdom
// Invitations de projet côté interface (plan-memoire-projet-droits-quotas.md, phase 3) : jamais « propriétaire » dans la liste des rôles, les refus du
// serveur sont expliqués, un email qui ne part pas se voit, l'état de chaque invité vis-à-vis de l'espace est montré, et le responsable de l'espace
// voit les projets sans propriétaire. Le réseau est doublé.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/app/[lang]/dictionaries/fr.json";
import type { ProjectInviteOut } from "@/lib/api";
import { AcceptInviteButton } from "./accept-invite-button";
import { InviteForm } from "./invite-form";
import { WorkspaceProjects } from "./workspace-projects";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = fr.workspace.projects;
let host: HTMLElement;
let root: Root;
let calls: { method: string; url: string; body?: unknown }[];

const respond = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }));
const invite = (over: Partial<ProjectInviteOut> = {}): ProjectInviteOut => ({
  id: "i1",
  project_id: "p1",
  email: "colleague@example.com",
  role: "editor",
  status: "pending",
  expires_at: "2026-10-20T10:00:00Z",
  created_at: "2026-10-17T10:00:00Z",
  token: "tok-project",
  space_status: "member",
  space_invite_token: null,
  ...over,
});

function stubFetch(handler: (url: string, method: string, body: unknown) => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      return handler(url, method, body);
    }),
  );
}

beforeEach(() => {
  calls = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = async (node: ReturnType<typeof createElement>) => {
  act(() => root.render(node));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
const type = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const submit = async () => {
  await act(async () => void host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => void (await Promise.resolve()));
};
const click = async (el: Element | undefined | null) => {
  expect(el).toBeTruthy();
  await act(async () => void el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await act(async () => void (await Promise.resolve()));
};
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

describe("InviteForm", () => {
  const mount = (initial: ProjectInviteOut[] = []) => render(createElement(InviteForm, { labels, projectId: "p1", initialInvites: initial }));

  it("ne propose jamais le rôle propriétaire", async () => {
    stubFetch(() => respond({}));
    await mount();
    const options = [...(host.querySelector("select") as HTMLSelectElement).options].map((o) => o.value);
    expect(options).toEqual(["editor", "viewer"]);
    expect(host.textContent).toContain(labels.inviteSpaceHint);
  });

  it("envoie l'invitation et montre l'état de la personne invitée vis-à-vis de l'espace", async () => {
    stubFetch(() => respond(invite({ email: "nouvelle@example.com", space_status: "space_invite_pending", space_invite_token: "tok-space", email_sent: true }), 200));
    await mount();
    await type(host.querySelector('input[type="email"]') as HTMLInputElement, "nouvelle@example.com");
    await submit();

    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/donna/chat/projects/p1/invites", body: { email: "nouvelle@example.com", role: "editor" } });
    expect(host.textContent).toContain("nouvelle@example.com");
    expect(host.textContent).toContain(labels.inviteSpaceStatus.space_invite_pending);
    expect(button(labels.inviteCopySpaceLink)).toBeTruthy(); // le second lien est copiable
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it("dit quand l'email n'est pas parti, sans cacher que l'invitation existe", async () => {
    stubFetch(() => respond(invite({ email_sent: false })));
    await mount();
    await type(host.querySelector('input[type="email"]') as HTMLInputElement, "colleague@example.com");
    await submit();
    expect(host.querySelector('[role="status"]')?.textContent).toBe(labels.inviteMailNotSent);
    expect(host.textContent).toContain("colleague@example.com");
  });

  it.each([
    [403, "outsideSpace"],
    [400, "invalid"],
    [502, "spaceInvite"],
    [503, "directory"],
    [500, "generic"],
  ] as const)("explique un refus %i", async (status, kind) => {
    stubFetch(() => respond({ detail: "x" }, status));
    await mount();
    await type(host.querySelector('input[type="email"]') as HTMLInputElement, "x@example.com");
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(labels.inviteErrors[kind]);
    expect(host.querySelectorAll("li")).toHaveLength(0); // rien n'a été ajouté à la liste
  });

  it("copie le lien du projet et, séparément, celui de l'espace", async () => {
    stubFetch(() => respond({}));
    const written: string[] = [];
    vi.stubGlobal("navigator", { clipboard: { writeText: (text: string) => { written.push(text); return Promise.resolve(); } } });
    await mount([invite({ space_status: "space_invite_pending", space_invite_token: "tok space" })]);
    await click(button(labels.inviteCopyLink));
    await click(button(labels.inviteCopySpaceLink));
    expect(written).toEqual([`${window.location.origin}/projects/invites/tok-project`, `${window.location.origin}/invitation?token=tok%20space`]);
  });

  it("n'invente aucune appartenance : un état inconnu est présenté comme inconnu", async () => {
    stubFetch(() => respond({}));
    await mount([invite({ space_status: "n'importe quoi" }), invite({ id: "i2", email: "b@example.com", space_status: "not_member" })]);
    expect(host.textContent).toContain(labels.inviteSpaceStatus.unknown);
    expect(host.textContent).toContain(labels.inviteSpaceStatus.not_member);
    expect(host.textContent).not.toContain(labels.inviteSpaceStatus.member);
  });
});

describe("AcceptInviteButton", () => {
  const dict = { ...fr.invite };

  it("oriente vers l'espace quand le compte est connecté dans un autre (403)", async () => {
    stubFetch(() => respond({ detail: "autre espace" }, 403));
    await render(createElement(AcceptInviteButton, { lang: "fr", token: "tok", labels: dict, spaceInviteHref: "/fr/invitation?token=tok-space" }));
    await click(button(dict.accept));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(dict.wrongSpace);
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/fr/invitation?token=tok-space");
    expect(host.textContent).not.toContain(dict.acceptError);
  });

  it("garde le message générique pour une vraie panne, et rien d'étranger quand l'invitation n'a pas de lien d'espace", async () => {
    stubFetch(() => respond({ detail: "boom" }, 500));
    await render(createElement(AcceptInviteButton, { lang: "fr", token: "tok", labels: dict }));
    await click(button(dict.accept));
    expect(host.textContent).toContain(dict.acceptError);
    expect(host.querySelector("a")).toBeNull();
  });
});

describe("WorkspaceProjects", () => {
  const project = (over: Record<string, unknown> = {}) => ({
    id: "p1", name: "Audit", member_count: 3, owner_count: 1, owners: ["ana@example.com"], my_role: null, created_at: "2026-10-01T10:00:00Z", ...over,
  });

  it("n'affiche rien à qui n'est pas responsable de l'espace (403)", async () => {
    stubFetch(() => respond({ detail: "interdit" }, 403));
    await render(createElement(WorkspaceProjects, { lang: "fr", labels }));
    expect(host.innerHTML).toBe("");
  });

  it("liste les projets avec leurs propriétaires, sans aucun contenu de projet", async () => {
    stubFetch(() => respond([project(), project({ id: "p2", name: "Sans chef", owner_count: 0, owners: [] })]));
    await render(createElement(WorkspaceProjects, { lang: "fr", labels }));
    const text = host.textContent ?? "";
    expect(text).toContain("Audit");
    expect(text).toContain(labels.workspaceProjectOwners.replace("{names}", "ana@example.com"));
    expect(text).toContain(labels.workspaceProjectNoOwner);
    expect(host.querySelectorAll("button")).toHaveLength(1); // seul le projet orphelin se reprend
  });

  it("reprend un projet sans propriétaire puis relit la liste", async () => {
    let claimed = false;
    stubFetch((url, method) => {
      if (method === "POST") {
        claimed = true;
        return respond({ claimed: true });
      }
      return respond([project({ id: "p2", name: "Sans chef", owner_count: claimed ? 1 : 0, owners: claimed ? ["moi@example.com"] : [], my_role: claimed ? "owner" : null })]);
    });
    await render(createElement(WorkspaceProjects, { lang: "fr", labels }));
    await click(button(labels.workspaceProjectClaim));
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/donna/chat/projects/p2/claim-ownership")).toBe(true);
    expect(host.textContent).toContain("moi@example.com");
    expect(button(labels.workspaceProjectClaim)).toBeUndefined();
  });

  it("dit quand la reprise est refusée", async () => {
    stubFetch((url, method) => (method === "POST" ? respond({ detail: "a déjà un propriétaire" }, 409) : respond([project({ owner_count: 0, owners: [] })])));
    await render(createElement(WorkspaceProjects, { lang: "fr", labels }));
    await click(button(labels.workspaceProjectClaim));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(labels.workspaceProjectClaimError);
  });
});
