"use client";

import { useSyncExternalStore } from "react";
import { installPromptSnapshot, iosInstallHint, isStandaloneDisplay, promptInstall, subscribeInstall } from "@/lib/pwa";

type Labels = { installTitle: string; installHint: string; installButton: string; installDone: string; installIos: string; installOther: string };

const subscribeDisplay = (listener: () => void) => {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
const standaloneNow = () => isStandaloneDisplay((q) => window.matchMedia(q).matches, (navigator as Navigator & { standalone?: boolean }).standalone);

/** Réglages › Préférences : installer DONNA sur l'écran d'accueil. Chrome/Edge/Android : bouton ; iPhone/iPad : le geste ; sinon, où le trouver. */
export function InstallApp({ labels }: { labels: Labels }) {
  const prompt = useSyncExternalStore(subscribeInstall, installPromptSnapshot, () => null);
  const installed = useSyncExternalStore(subscribeDisplay, standaloneNow, () => false);
  const ios = useSyncExternalStore(
    () => () => {},
    () => iosInstallHint({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }),
    () => false,
  );

  return (
    <div className="flex flex-col gap-2" data-testid="install-app">
      <p className="text-label font-medium text-ink">{labels.installTitle}</p>
      <p className="text-secondary text-ink-3 text-pretty">{labels.installHint}</p>
      {installed ? (
        <p className="text-secondary text-ink-2">{labels.installDone}</p>
      ) : prompt ? (
        <button
          type="button"
          onClick={() => void promptInstall()}
          className="self-start rounded-button bg-brand-fill px-4 py-2 text-label font-medium text-white hover:bg-brand-fill-strong"
        >
          {labels.installButton}
        </button>
      ) : (
        <p className="text-secondary text-ink-2 text-pretty">{ios ? labels.installIos : labels.installOther}</p>
      )}
    </div>
  );
}
