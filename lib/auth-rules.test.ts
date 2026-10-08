import { describe, expect, it } from "vitest";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { EMAIL_PATTERN, isAuthErrorKey, isStrongPassword, passwordRules } from "./auth-rules";

describe("auth-rules", () => {
  describe("EMAIL_PATTERN", () => {
    it("valide les adresses email correctes", () => {
      expect(EMAIL_PATTERN.test("user@example.com")).toBe(true);
      expect(EMAIL_PATTERN.test("alex.dev@sub.donna.ai")).toBe(true);
    });

    it("rejette les adresses email invalides", () => {
      expect(EMAIL_PATTERN.test("invalid-email")).toBe(false);
      expect(EMAIL_PATTERN.test("user@.com")).toBe(false);
      expect(EMAIL_PATTERN.test("user@com")).toBe(false);
      expect(EMAIL_PATTERN.test("")).toBe(false);
    });
  });

  describe("passwordRules", () => {
    it("évalue correctement la longueur, la majuscule et le chiffre", () => {
      expect(passwordRules("Short1")).toEqual({
        length: false,
        uppercase: true,
        digit: true,
      });

      expect(passwordRules("lowercase123")).toEqual({
        length: true,
        uppercase: false,
        digit: true,
      });

      expect(passwordRules("PassWordWithNoDigit")).toEqual({
        length: true,
        uppercase: true,
        digit: false,
      });

      expect(passwordRules("ValidPass123")).toEqual({
        length: true,
        uppercase: true,
        digit: true,
      });
    });
  });

  describe("isStrongPassword", () => {
    it("renvoie true seulement si toutes les règles sont satisfaites", () => {
      expect(isStrongPassword("ValidPass123")).toBe(true);
      expect(isStrongPassword("weak")).toBe(false);
      expect(isStrongPassword("NoDigitPassword")).toBe(false);
    });
  });

  describe("isAuthErrorKey", () => {
    const mockErrors = {
      invalid_credentials: "Identifiants invalides",
      session_expired: "Session expirée",
    } as unknown as Dictionary["auth"]["errors"];

    it("vérifie si la clé existe dans le dictionnaire d'erreurs", () => {
      expect(isAuthErrorKey("invalid_credentials", mockErrors)).toBe(true);
      expect(isAuthErrorKey("unknown_error", mockErrors)).toBe(false);
      expect(isAuthErrorKey(123, mockErrors)).toBe(false);
      expect(isAuthErrorKey(null, mockErrors)).toBe(false);
    });
  });
});
