"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import { BellIcon, CloseIcon } from "./icons";
import { useWorkspace } from "./workspace-provider";

/**
 * Rappels qui viennent de se déclencher et notifications d'automatisations (briefing du matin…) : DONNA les
 * signale dans l'application en plus de WhatsApp et de l'email (canal websocket, voir lib/user-channel.ts). La
 * carte reste affichée jusqu'à ce que l'utilisateur la ferme — un rappel qu'on ne voit pas ne sert à rien.
 */
export function ReminderToasts({ lang, labels }: { lang: Locale; labels: Dictionary["workspace"]["reminders"] }) {
  const { reminders, dismissReminder } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  // Résultat de la demande d'autorisation faite depuis la carte ; sinon l'état courant du navigateur.
  const [asked, setAsked] = useState<NotificationPermission | null>(null);

  if (!reminders.length) return null;

  // Lu au rendu, jamais avant qu'un rappel n'existe (donc jamais pendant le rendu serveur). Absent de certains webviews.
  const permission = asked ?? (typeof Notification === "undefined" ? null : Notification.permission);

  return (
    <div
      role="region"
      aria-label={labels.region}
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:w-96"
    >
      {reminders.map((reminder) => (
        <div
          key={reminder.id}
          role="alert"
          className="pointer-events-auto w-full rounded-panel border border-border bg-surface p-4 shadow-float"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-peche-100 text-bordeaux-700">
              <BellIcon size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-meta font-medium text-bordeaux-700">{reminder.title ?? labels.title}</p>
              <p className="mt-0.5 line-clamp-6 text-label whitespace-pre-line text-ink text-pretty break-words">{reminder.content}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {/* Inutile quand la conversation du rappel est déjà à l'écran. */}
                {reminder.conversationId && !pathname.includes(`/app/c/${reminder.conversationId}`) && (
                  <button
                    type="button"
                    onClick={() => {
                      router.push(`/${lang}/app/c/${reminder.conversationId}`);
                      dismissReminder(reminder.id);
                    }}
                    className="rounded-button bg-bordeaux-700 px-3 py-1.5 text-secondary font-medium text-white hover:bg-bordeaux-900"
                  >
                    {labels.open}
                  </button>
                )}
                {permission === "default" && (
                  <button
                    type="button"
                    onClick={() => void Notification.requestPermission().then(setAsked)}
                    className="rounded-button bg-fill px-3 py-1.5 text-secondary font-medium text-ink hover:bg-active"
                  >
                    {labels.enableBrowser}
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismissReminder(reminder.id)}
              aria-label={labels.dismiss}
              className="flex size-7 shrink-0 items-center justify-center rounded-button text-ink-3 hover:bg-active hover:text-ink"
            >
              <CloseIcon size={15} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
