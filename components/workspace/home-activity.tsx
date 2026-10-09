"use client";

import Link from "next/link";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import type { ActivityItem, ActivityState } from "@/lib/activity";
import { visibleElapsed } from "@/lib/elapsed";
import { useNow } from "@/lib/use-now";
import { useRecentActivity } from "@/lib/use-recent-activity";
import { ElapsedBadge } from "./elapsed-badge";
import { useWorkspace } from "./workspace-provider";

type WorkspaceDict = Dictionary["workspace"];

const TONE: Record<ActivityState, { dot: string; text: string }> = {
  running: { dot: "pending-dot bg-brand-fill", text: "text-brand" },
  done: { dot: "bg-success-fill", text: "text-success-ink" },
  failed: { dot: "bg-danger-fill", text: "text-danger" },
  skipped: { dot: "bg-ink-3", text: "text-ink-3" },
  cancelled: { dot: "bg-ink-3", text: "text-ink-3" },
  interrupted: { dot: "bg-ink-3", text: "text-ink-3" },
};

/**
 * Ce que DONNA a fait sans qu'on le lui demande dans le fil : une automatisation qui a tourné, une recherche terminée.
 *
 * Ces arrivées n'avaient qu'un toast, fermé et oublié. Ici elles viennent du serveur (lib/use-recent-activity.ts) : elles
 * restent après un rechargement, et la ligne d'un travail en cours passe d'elle-même à « terminé ». La section n'existe que
 * s'il y a quelque chose à dire — jamais de « aucune activité » : sur un compte neuf, l'accueil ne montre pas ce bloc.
 *
 * Le nombre de cartes d'arrivée sert de clé de relecture : quand une automatisation vient de finir (notification), la liste
 * se met à jour sans attendre.
 */
export function HomeActivity({ lang, dict }: { lang: Locale; dict: WorkspaceDict }) {
  const { reminders } = useWorkspace();
  const items = useRecentActivity(reminders.map((reminder) => reminder.id).join("|"));
  const running = items?.some((entry) => entry.state === "running") ?? false;
  const now = useNow(running);

  if (!items?.length) return null;

  return (
    <section aria-labelledby="home-activity">
      <h2 id="home-activity" className="mb-2 text-caps font-medium text-ink-3 uppercase">
        {dict.chat.homeActivity}
      </h2>
      <ul className="flex flex-col overflow-hidden rounded-panel border border-border bg-surface">
        {items.map((entry) => (
          <ActivityRow key={entry.key} lang={lang} dict={dict} entry={entry} now={now} />
        ))}
      </ul>
    </section>
  );
}

function ActivityRow({ lang, dict, entry, now }: { lang: Locale; dict: WorkspaceDict; entry: ActivityItem; now: number }) {
  const tone = TONE[entry.state];
  // Le résultat d'une automatisation vit dans sa conversation de notification ; tant qu'elle n'existe pas, on renvoie à la page des automatisations.
  const href = entry.conversationId ? `/${lang}/app/c/${entry.conversationId}` : `/${lang}/app/workflows`;
  const took = entry.endedAt === null ? null : visibleElapsed(entry.startedAt, entry.endedAt, dict.chat.elapsed);

  return (
    <li className="border-b border-border last:border-b-0">
      <Link href={href} className="flex items-start gap-2.5 px-4 py-3 no-underline hover:bg-active hover:text-ink">
        <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tone.dot}`} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-label text-ink">{entry.title}</span>
          <span className="mt-0.5 text-meta text-ink-3">
            {dict.chat.homeActivityKind[entry.kind]} · <span className={tone.text}>{dict.chat.homeActivityState[entry.state]}</span>
            {entry.state === "running" ? (
              <>
                {" "}
                <ElapsedBadge startedAt={entry.startedAt} now={now} units={dict.chat.elapsed} className="text-ink-3" separator />
              </>
            ) : (
              took && <> · {took}</>
            )}
            {" · "}
            <time dateTime={new Date(entry.at).toISOString()} className="whitespace-nowrap" suppressHydrationWarning>
              {new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(entry.at)}
            </time>
          </span>
        </span>
      </Link>
    </li>
  );
}
