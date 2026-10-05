import { afterEach, describe, expect, it, vi } from "vitest";
import { captureInstallPrompt, installPromptSnapshot, iosInstallHint, isIos, isStandaloneDisplay, promptInstall, subscribeInstall } from "./pwa";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

describe("iOS", () => {
  it("reconnaît iPhone et iPad, y compris l'iPad qui se présente comme un Mac tactile", () => {
    expect(isIos({ userAgent: IPHONE })).toBe(true);
    expect(isIos({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false); // un vrai Mac
    expect(isIos({ userAgent: ANDROID })).toBe(false);
  });

  it("ne donne le geste « Sur l'écran d'accueil » que pour Safari", () => {
    expect(iosInstallHint({ userAgent: IPHONE })).toBe(true);
    expect(iosInstallHint({ userAgent: IPHONE_CHROME })).toBe(false);
    expect(iosInstallHint({ userAgent: ANDROID })).toBe(false);
  });
});

describe("mode installé", () => {
  it("détecte le mode application, quelle que soit la façon dont il est annoncé", () => {
    expect(isStandaloneDisplay((q) => q === "(display-mode: standalone)")).toBe(true);
    expect(isStandaloneDisplay((q) => q === "(display-mode: window-controls-overlay)")).toBe(true);
    expect(isStandaloneDisplay(() => false, true)).toBe(true);
    expect(isStandaloneDisplay(() => false, false)).toBe(false);
    expect(isStandaloneDisplay(() => false)).toBe(false);
  });
});

describe("invite d'installation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  });

  function fakeEvent(outcome: "accepted" | "dismissed") {
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome });
    return event;
  }

  it("capte l'événement (sans laisser le navigateur ouvrir sa propre invite), le sert une fois, puis l'oublie", async () => {
    const target = new EventTarget() as unknown as Window;
    cleanups.push(captureInstallPrompt(target));
    const changed = vi.fn();
    cleanups.push(subscribeInstall(changed));

    expect(installPromptSnapshot()).toBeNull();
    const event = fakeEvent("accepted");
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(installPromptSnapshot()).toBe(event);
    expect(changed).toHaveBeenCalledTimes(1);

    expect(await promptInstall()).toBe(true);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(installPromptSnapshot()).toBeNull(); // l'événement ne sert qu'une fois
    expect(await promptInstall()).toBe(false);
  });

  it("rend faux quand l'utilisateur refuse, et quand l'invite échoue", async () => {
    const target = new EventTarget() as unknown as Window;
    cleanups.push(captureInstallPrompt(target));
    target.dispatchEvent(fakeEvent("dismissed"));
    expect(await promptInstall()).toBe(false);

    const broken = fakeEvent("accepted");
    broken.prompt = vi.fn().mockRejectedValue(new Error("déjà utilisée"));
    target.dispatchEvent(broken);
    expect(await promptInstall()).toBe(false);
  });

  it("oublie l'événement quand l'application vient d'être installée, et se débranche proprement", () => {
    const target = new EventTarget() as unknown as Window;
    const stop = captureInstallPrompt(target);
    target.dispatchEvent(fakeEvent("accepted"));
    expect(installPromptSnapshot()).not.toBeNull();
    target.dispatchEvent(new Event("appinstalled"));
    expect(installPromptSnapshot()).toBeNull();
    stop();
    target.dispatchEvent(fakeEvent("accepted"));
    expect(installPromptSnapshot()).toBeNull(); // plus d'écouteur
  });
});
