import { describe, expect, it } from "vitest";

const ALLOWED = [
  /^chat(\/|$)/,
  /^rag\/documents\/[^/]+\/file$/,
  /^auth\/oauth\/me\/accounts$/,
  /^auth\/oauth\/[^/]+\/unlink$/,
  /^profile(\/|$)/,
  /^workflows(\/|$)/,
  /^auth\/ws\/ticket$/,
  /^rag\/documents$/,
  /^auth\/me$/,
  /^auth\/sessions(\/[^/]+)?$/,
  /^auth\/mfa\/(setup|enable|verify|backup-codes\/regenerate)$/,
  /^auth\/mfa\/?$/,
  /^auth\/password\/(change|set)$/,
  /^auth\/invites\/accept$/,
];

function isAllowed(path: string): boolean {
  return ALLOWED.some((rule) => rule.test(path));
}

describe("API Proxy ALLOWED rules", () => {
  it("allows chat routes", () => {
    expect(isAllowed("chat")).toBe(true);
    expect(isAllowed("chat/stream")).toBe(true);
    expect(isAllowed("chat/conversations")).toBe(true);
  });

  it("allows rag document files download and list", () => {
    expect(isAllowed("rag/documents")).toBe(true);
    expect(isAllowed("rag/documents/doc-123/file")).toBe(true);
    expect(isAllowed("rag/documents/doc-123/other")).toBe(false);
  });

  it("allows profile and workflows routes", () => {
    expect(isAllowed("profile")).toBe(true);
    expect(isAllowed("profile/settings")).toBe(true);
    expect(isAllowed("workflows")).toBe(true);
    expect(isAllowed("workflows/123/run")).toBe(true);
  });

  it("allows specific auth security settings and MFA routes", () => {
    expect(isAllowed("auth/me")).toBe(true);
    expect(isAllowed("auth/sessions")).toBe(true);
    expect(isAllowed("auth/sessions/s-1")).toBe(true);
    expect(isAllowed("auth/mfa")).toBe(true);
    expect(isAllowed("auth/mfa/setup")).toBe(true);
    expect(isAllowed("auth/mfa/enable")).toBe(true);
    expect(isAllowed("auth/mfa/verify")).toBe(true);
    expect(isAllowed("auth/mfa/backup-codes/regenerate")).toBe(true);
    expect(isAllowed("auth/password/change")).toBe(true);
    expect(isAllowed("auth/password/set")).toBe(true);
    expect(isAllowed("auth/invites/accept")).toBe(true);
    expect(isAllowed("auth/ws/ticket")).toBe(true);
    expect(isAllowed("auth/oauth/me/accounts")).toBe(true);
    expect(isAllowed("auth/oauth/google/unlink")).toBe(true);
  });

  it("blocks unallowed admin, raw auth, or unknown backend endpoints", () => {
    expect(isAllowed("admin")).toBe(false);
    expect(isAllowed("admin/users")).toBe(false);
    expect(isAllowed("auth/raw")).toBe(false);
    expect(isAllowed("evals")).toBe(false);
    expect(isAllowed("internal/health")).toBe(false);
  });
});
