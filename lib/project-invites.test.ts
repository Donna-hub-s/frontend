import { describe, expect, it } from "vitest";
import { inviteErrorKind, isOrphan, projectInviteLink, spaceInviteLink, spaceStatusKey, type WorkspaceProject } from "./project-invites";

describe("invitations de projet", () => {
  it("n'invente jamais « membre » : toute valeur inconnue est « inconnue »", () => {
    expect(spaceStatusKey("member")).toBe("member");
    expect(spaceStatusKey("space_invite_pending")).toBe("space_invite_pending");
    expect(spaceStatusKey("not_member")).toBe("not_member");
    for (const odd of ["", "MEMBER", "admin", null, undefined]) expect(spaceStatusKey(odd)).toBe("unknown");
  });

  it("classe les refus du serveur", () => {
    expect(inviteErrorKind(400)).toBe("invalid");
    expect(inviteErrorKind(403)).toBe("outsideSpace");
    expect(inviteErrorKind(502)).toBe("spaceInvite");
    expect(inviteErrorKind(503)).toBe("directory");
    expect(inviteErrorKind(0)).toBe("generic");
    expect(inviteErrorKind(500)).toBe("generic");
  });

  it("construit les liens que la personne invitée ouvrira", () => {
    expect(projectInviteLink("https://donna.test", "abc")).toBe("https://donna.test/projects/invites/abc");
    expect(spaceInviteLink("https://donna.test", "a b&c")).toBe("https://donna.test/invitation?token=a%20b%26c");
  });

  it("repère un projet sans propriétaire", () => {
    const base: WorkspaceProject = { id: "p", name: "P", member_count: 2, owner_count: 1, owners: ["a@x.org"], my_role: null, created_at: "2026-10-14T10:00:00Z" };
    expect(isOrphan(base)).toBe(false);
    expect(isOrphan({ ...base, owner_count: 0, owners: [] })).toBe(true);
  });
});
