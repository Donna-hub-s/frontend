import { describe, expect, it } from "vitest";
import { EXPORT_FORMATS, exportHref } from "./conversation-export";

describe("exportHref", () => {
  it("construit l'adresse de chaque format, langue comprise", () => {
    expect(EXPORT_FORMATS).toEqual(["md", "pdf", "docx"]);
    expect(exportHref("c1", "pdf", "fr")).toBe("/api/donna/chat/c1/export?format=pdf&lang=fr");
    expect(exportHref("c1", "docx", "en")).toBe("/api/donna/chat/c1/export?format=docx&lang=en");
  });

  it("n'envoie que les langues connues et encode l'identifiant", () => {
    expect(exportHref("a/b?c", "md", "de")).toBe("/api/donna/chat/a%2Fb%3Fc/export?format=md&lang=fr");
  });
});
