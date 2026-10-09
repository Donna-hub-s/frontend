"use client";

import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import { PendingItem } from "./side-panel";
import { useWorkspace } from "./workspace-provider";

type WorkspaceDict = Dictionary["workspace"];

/**
 * Page « À valider » : tout ce qui attend une décision humaine, au même endroit.
 *
 * Ça n'existait nulle part. Le panneau latéral qui les porte est en `xl:flex`,
 * donc INVISIBLE sous 1280 px : sur un portable, une fois sorti de l'accueil, rien
 * ne montrait plus qu'un email attendait d'être envoyé. Or c'est la promesse même
 * du produit — elle ne peut pas dépendre de la largeur de l'écran.
 *
 * Aucun appel réseau : les actions sont déjà chargées par le layout et tenues à
 * jour par le provider (websocket). On décide sur place, via le même composant
 * que le panneau — mêmes garde-fous, rien à maintenir en double.
 */
export function ApprovalsPage({ lang, dict }: { lang: Locale; dict: WorkspaceDict }) {
  const { pending } = useWorkspace();
  const labels = dict.approvals;

  return (
    <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-6 px-4 py-8 md:px-8">
      <div className="flex max-w-[36rem] flex-col gap-1">
        <h1 className="flex items-center gap-2.5 text-hero-sm font-medium text-ink">
          {labels.title}
          {pending.length > 0 && (
            <span className="rounded-full bg-attention-fill px-2 py-0.5 text-meta font-medium text-white tabular-nums">{pending.length}</span>
          )}
        </h1>
        <p className="text-secondary text-ink-3 text-pretty">{labels.subtitle}</p>
      </div>

      {pending.length === 0 ? (
        <p className="rounded-panel border border-border bg-surface px-4 py-10 text-center text-secondary text-ink-3">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-panel border border-attention/40 bg-attention-soft">
          {pending.map((action) => (
            <PendingItem key={action.id} lang={lang} dict={dict} action={action} />
          ))}
        </ul>
      )}
    </div>
  );
}
