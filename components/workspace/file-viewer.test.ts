import { describe, expect, it } from "vitest";
import { cellFormatter, parseDelimited, previewKind, sanitizeHtml } from "./file-viewer";

describe("file-viewer previewKind", () => {
  it("identifies known extensions correctly", () => {
    expect(previewKind("document.pdf")).toBe("pdf");
    expect(previewKind("photo.png")).toBe("image");
    expect(previewKind("photo.JPEG")).toBe("image");
    expect(previewKind("report.docx")).toBe("docx");
    expect(previewKind("sheet.xlsx")).toBe("xlsx");
    expect(previewKind("data.csv")).toBe("csv");
    expect(previewKind("README.md")).toBe("markdown");
    expect(previewKind("notes.txt")).toBe("text");
    expect(previewKind("archive.zip")).toBe("other");
    expect(previewKind("noextension")).toBe("other");
  });
});

describe("file-viewer cellFormatter", () => {
  it("formats null and undefined as empty string", () => {
    const fmtFr = cellFormatter("fr");
    expect(fmtFr(null)).toBe("");
    expect(fmtFr(undefined)).toBe("");
  });

  it("formats booleans according to locale", () => {
    const fmtFr = cellFormatter("fr");
    const fmtEn = cellFormatter("en");

    expect(fmtFr(true)).toBe("VRAI");
    expect(fmtFr(false)).toBe("FAUX");

    expect(fmtEn(true)).toBe("TRUE");
    expect(fmtEn(false)).toBe("FALSE");
  });

  it("formats numbers and dates", () => {
    const fmtFr = cellFormatter("fr");
    const formatted = fmtFr(1234.56);
    expect(formatted).toMatch(/1[\s\u00a0\u202f]234,56/);

    const date = new Date(2025, 0, 15);
    expect(fmtFr(date)).toContain("2025");
  });
});

describe("file-viewer parseDelimited", () => {
  it("parses comma-separated values", () => {
    const csv = "Name,Age,City\nAlice,30,Paris\nBob,25,Lyon";
    const rows = parseDelimited(csv);
    expect(rows).toEqual([
      ["Name", "Age", "City"],
      ["Alice", "30", "Paris"],
      ["Bob", "25", "Lyon"],
    ]);
  });

  it("parses semicolon-separated values and escaped quotes", () => {
    const csv = 'Name;Comment\nAlice;"Hello ""World"""\nBob;Simple';
    const rows = parseDelimited(csv);
    expect(rows).toEqual([
      ["Name", "Comment"],
      ["Alice", 'Hello "World"'],
      ["Bob", "Simple"],
    ]);
  });
});

describe("file-viewer sanitizeHtml", () => {
  it("allows safe tags and attributes", () => {
    const html = '<p>Hello <strong>World</strong> <a href="https://example.com">Link</a></p>';
    const sanitized = sanitizeHtml(html);
    expect(sanitized).toContain("<p>Hello <strong>World</strong>");
    expect(sanitized).toContain('href="https://example.com"');
    expect(sanitized).toContain('target="_blank"');
    expect(sanitized).toContain('rel="noopener noreferrer nofollow"');
  });

  it("strips active content like script and iframe", () => {
    const html = '<div><script>alert("xss")</script><p>Safe text</p><iframe src="http://evil.com"></iframe></div>';
    const sanitized = sanitizeHtml(html);
    expect(sanitized).not.toContain("<script>");
    expect(sanitized).not.toContain("alert");
    expect(sanitized).not.toContain("<iframe");
    expect(sanitized).toContain("<p>Safe text</p>");
  });

  it("removes unsafe javascript: href links", () => {
    const html = '<a href="javascript:alert(1)">Click me</a>';
    const sanitized = sanitizeHtml(html);
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).toContain("Click me");
  });
});
