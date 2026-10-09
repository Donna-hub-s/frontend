"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import { homeConnectorsHidden, missingGoogleServices } from "@/lib/home-connectors";
import { linkHref, type GoogleService } from "@/lib/oauth-link";
import { GmailIcon, GoogleCalendarIcon, GoogleDriveIcon } from "./brand-icons";
import { useConnectors } from "./connectors-context";

type WorkspaceDict = Dictionary["workspace"];

/**
 * « À brancher » : les services Google que DONNA n'a pas encore le droit d'utiliser, chacun avec son bouton. Chaque accès s'autorise
 * séparément (lib/oauth-link.ts) et l'on revient sur l'accueil. Le bloc disparaît tout seul quand tout est autorisé, et se masque
 * d'un clic (cette page seulement : les connecteurs restent dans le panneau latéral et les Réglages).
 *
 * Il n'existe que s'il y a quelque chose à brancher : jamais de « tout est connecté ».
 */
export function HomeConnectors({ lang, dict }: { lang: Locale; dict: WorkspaceDict }) {
  const connectors = useConnectors();
  const pathname = usePathname();
  // Masqué tant que l'on ne sait pas (rendu serveur) : le bloc apparaît après l'hydratation plutôt que de clignoter pour ceux qui l'ont masqué.
  const hidden = useSyncExternalStore(homeConnectorsHidden.subscribe, homeConnectorsHidden.read, () => true);
  const missing = missingGoogleServices(connectors?.google);
  if (hidden || !missing.length) return null;

  const { panel, chat } = dict;
  // Google déjà relié (on s'est connecté avec) : il ne manque qu'un accès, « Autoriser ». Sinon c'est un premier lien : « Connecter ».
  const action = connectors?.google.connected ? panel.authorize : panel.connect;
  const rows: Record<GoogleService, { icon: ReactNode; name: string; detail: string }> = {
    gmail: { icon: <GmailIcon />, name: panel.gmail, detail: panel.gmailDetail },
    calendar: { icon: <GoogleCalendarIcon />, name: panel.googleCalendar, detail: panel.calendarDetail },
    drive: { icon: <GoogleDriveIcon />, name: panel.googleDrive, detail: panel.driveDetail },
  };

  return (
    <section aria-labelledby="home-connectors">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="home-connectors" className="text-caps font-medium text-ink-3 uppercase">
          {chat.homeConnectors}
        </h2>
        <button type="button" onClick={homeConnectorsHidden.set} className="text-meta text-ink-3 hover:text-ink">
          {chat.homeConnectorsHide}
        </button>
      </div>
      <p className="mb-2 text-secondary text-ink-3 text-pretty">{chat.homeConnectorsHint}</p>
      <ul className="flex flex-col overflow-hidden rounded-panel border border-border bg-surface">
        {missing.map((service) => (
          <li key={service} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-nav border border-border bg-surface">{rows[service].icon}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-label font-medium text-ink">{rows[service].name}</span>
              <span className="text-meta text-ink-3 text-pretty">{rows[service].detail}</span>
            </span>
            <a
              href={linkHref(lang, { services: [service], next: pathname })}
              aria-label={`${action} — ${rows[service].name}`}
              className="shrink-0 rounded-button border border-border bg-surface px-2.5 py-1 text-meta font-medium text-brand no-underline hover:border-brand/40 hover:text-brand-strong"
            >
              {action}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
