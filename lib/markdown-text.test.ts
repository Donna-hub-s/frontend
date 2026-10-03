import { describe, expect, it } from "vitest";
import { codeLanguage, nodeText } from "./markdown-text";

const pre = (className: unknown, ...children: unknown[]) => ({
  type: "element",
  tagName: "pre",
  children: [{ type: "element", tagName: "code", properties: { className }, children }],
});

describe("nodeText", () => {
  it("assemble le texte de tous les descendants (code coloré compris)", () => {
    const node = pre(["language-python"], { type: "text", value: "x = " }, { type: "element", tagName: "span", children: [{ type: "text", value: "1" }] }, { type: "text", value: "\n" });
    expect(nodeText(node)).toBe("x = 1\n");
  });

  it("tolère l'absence de nœud", () => {
    expect(nodeText(undefined)).toBe("");
    expect(nodeText({})).toBe("");
  });
});

describe("codeLanguage", () => {
  it("lit la classe language-xxx", () => {
    expect(codeLanguage(pre(["hljs", "language-python"]))).toBe("python");
    expect(codeLanguage(pre("language-sql extra"))).toBe("sql");
  });

  it("renvoie null sans langage", () => {
    expect(codeLanguage(pre(undefined))).toBeNull();
    expect(codeLanguage(pre(["language-"]))).toBeNull();
    expect(codeLanguage({ children: [] })).toBeNull();
  });
});
