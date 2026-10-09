import { describe, expect, it } from "vitest";
import { loginErrorKey, parseLinkResult, withoutLinkResult } from "./oauth-feedback";

const params = (query: string) => new URLSearchParams(query);

describe("loginErrorKey", () => {
  it("traduit les codes connus du backend en clés du dictionnaire", () => {
    expect(loginErrorKey("account_disabled")).toBe("accountInactive");
    expect(loginErrorKey("state_invalid")).toBe("oauthExpired");
    expect(loginErrorKey("provider_error")).toBe("oauth");
  });

  it("retombe sur le message OAuth générique pour tout le reste", () => {
    expect(loginErrorKey(null)).toBe("oauth");
    expect(loginErrorKey("")).toBe("oauth");
    expect(loginErrorKey("Compte désactivé.")).toBe("oauth");
  });
});

describe("parseLinkResult", () => {
  it("reconnaît une liaison réussie", () => {
    expect(parseLinkResult(params("linked=google"))).toEqual({ status: "linked", provider: "google" });
  });

  it("reconnaît les codes d'échec annoncés par le backend", () => {
    expect(parseLinkResult(params("link_error=already_linked"))).toEqual({ status: "error", code: "already_linked" });
    expect(parseLinkResult(params("link_error=state_invalid"))).toEqual({ status: "error", code: "state_invalid" });
  });

  it("n'affiche jamais un texte venu de l'adresse : un code inconnu devient « generic »", () => {
    expect(parseLinkResult(params("link_error=Votre+compte+est+pirat%C3%A9"))).toEqual({ status: "error", code: "generic" });
  });

  it("ignore un fournisseur inconnu ou une adresse sans retour", () => {
    expect(parseLinkResult(params("linked=evil"))).toBeNull();
    expect(parseLinkResult(params("linked=constructor"))).toBeNull();
    expect(parseLinkResult(params("project=abc"))).toBeNull();
    expect(parseLinkResult(params(""))).toBeNull();
  });

  it("l'échec l'emporte si les deux paramètres sont présents", () => {
    expect(parseLinkResult(params("linked=google&link_error=already_linked"))).toEqual({ status: "error", code: "already_linked" });
  });
});

describe("withoutLinkResult", () => {
  it("retire les paramètres de retour et garde le reste de l'adresse", () => {
    const url = new URL("https://donna.test/fr/app?linked=google&project=abc#haut");
    expect(withoutLinkResult(url).toString()).toBe("https://donna.test/fr/app?project=abc#haut");
    expect(url.search).toBe("?linked=google&project=abc");
  });

  it("laisse une adresse propre telle quelle", () => {
    expect(withoutLinkResult(new URL("https://donna.test/fr/app")).toString()).toBe("https://donna.test/fr/app");
  });
});
