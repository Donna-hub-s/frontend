"use client";

import { useEffect, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { PROVIDER_NAMES, parseLinkResult, withoutLinkResult, type LinkResult } from "@/lib/oauth-feedback";
import { CheckIcon, CloseIcon } from "./icons";

/** Une liaison réussie se confirme d'elle-même ; un échec reste affiché jusqu'à ce qu'on le ferme. */
const SUCCESS_MS = 6000;

/**
 * Avis de retour d'une liaison de fournisseur (Réglages › Comptes liés, connecteurs, sélecteur Drive). Le backend
 * (xauth, routes/oauth.py::callback) revient sur l'espace de travail avec `?linked=<fournisseur>` ou
 * `?link_error=<code>` : sans ce composant l'utilisateur retombait sur une conversation vide, sans savoir si
 * « Reconnecter Google » avait marché — ni pourquoi quand le compte appartenait déjà à quelqu'un d'autre.
 * Les paramètres sont lus une fois puis retirés de l'adresse (voir lib/oauth-feedback.ts : jamais affichés tels quels).
 */
export function OAuthLinkNotice({ labels }: { labels: Dictionary["workspace"]["oauthLink"] }) {
  const [result, setResult] = useState<LinkResult | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const found = parseLinkResult(url.searchParams);
    if (!found) return;
    window.history.replaceState(window.history.state, "", withoutLinkResult(url));
    // queueMicrotask : pas de setState synchrone dans le corps de l'effet (react-hooks/set-state-in-effect).
    queueMicrotask(() => setResult(found));
  }, []);

  const succeeded = result?.status === "linked";
  useEffect(() => {
    if (!succeeded) return;
    const timer = window.setTimeout(() => setResult(null), SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [succeeded]);

  if (!result) return null;

  const message =
    result.status === "linked"
      ? labels.linked.replace("{provider}", PROVIDER_NAMES[result.provider] ?? result.provider)
      : labels.errors[result.code];

  return (
    <div role="region" aria-label={labels.region} className="pointer-events-none fixed inset-x-4 top-4 z-50 sm:inset-x-auto sm:right-4 sm:w-96">
      <div
        role={succeeded ? "status" : "alert"}
        className="pointer-events-auto flex items-start gap-3 rounded-panel border border-border bg-white p-4 shadow-float"
      >
        <span
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${succeeded ? "bg-success-soft text-success-ink" : "bg-fill text-danger"}`}
        >
          {succeeded ? <CheckIcon size={17} /> : <CloseIcon size={17} />}
        </span>
        <p className="min-w-0 flex-1 pt-1 text-label text-ink text-pretty break-words">{message}</p>
        <button
          type="button"
          onClick={() => setResult(null)}
          aria-label={labels.dismiss}
          className="flex size-7 shrink-0 items-center justify-center rounded-button text-ink-3 hover:bg-active hover:text-ink"
        >
          <CloseIcon size={15} />
        </button>
      </div>
    </div>
  );
}
