import { describe, expect, it } from "vitest";
import { isPlainClick, type ClickLike } from "./link-click";

const click = (over: Partial<ClickLike> = {}): ClickLike => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...over });

describe("isPlainClick", () => {
  it("accepte le clic simple du bouton principal", () => {
    expect(isPlainClick(click())).toBe(true);
  });

  it("laisse au navigateur les clics avec une touche modificatrice", () => {
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) expect(isPlainClick(click({ [key]: true }))).toBe(false);
  });

  it("laisse au navigateur le bouton du milieu et le clic droit", () => {
    expect(isPlainClick(click({ button: 1 }))).toBe(false);
    expect(isPlainClick(click({ button: 2 }))).toBe(false);
  });

  it("ne reprend pas un clic déjà traité", () => {
    expect(isPlainClick(click({ defaultPrevented: true }))).toBe(false);
  });
});
