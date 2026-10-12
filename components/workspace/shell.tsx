"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { DonnaLockup } from "@/components/brand/donna-mark";
import type { ConnectorsOut, ConversationOut, PendingActionOut, ProjectOut } from "@/lib/workspace-types";
import { ChevronIcon, MenuIcon } from "./icons";
import { SearchPalette } from "./search-palette";
import { ConnectorRows, SidePanel } from "./side-panel";
import { Sidebar, type Account } from "./sidebar";
import { FileViewer } from "./file-viewer";
import { ThemeSync } from "@/components/theme-sync";
import { ConnectorsProvider } from "./connectors-context";
import { MarkdownLabelsProvider } from "./markdown";
import { OAuthLinkNotice } from "./oauth-link-notice";
import { OfflineBanner } from "./offline-banner";
import { ReminderToasts } from "./reminder-toasts";
import { SettingsDialog } from "./settings-dialog";
import { WorkspaceProvider } from "./workspace-provider";

/** Cadre de l'espace de travail : barre latérale | conversation | panneau d'activité. */
export function WorkspaceShell({
  lang,
  dict,
  languageLabel,
  account,
  connectors,
  conversations,
  pending,
  projects,
  oauthProviders,
  wsBaseUrl = null,
  children,
}: {
  lang: Locale;
  dict: Dictionary["workspace"];
  languageLabel: string;
  account: Account;
  connectors: ConnectorsOut | null;
  conversations: ConversationOut[];
  pending: PendingActionOut[];
  projects: ProjectOut[];
  /** Fournisseurs OAuth réellement configurés côté backend (comptes liés, settings-dialog.tsx). */
  oauthProviders: string[];
  wsBaseUrl?: string | null;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ConnectorsProvider value={connectors}>
    <WorkspaceProvider
      initialConversations={conversations}
      initialPending={pending}
      initialProjects={projects}
      wsBaseUrl={wsBaseUrl}
    >
      <MarkdownLabelsProvider
        value={{
          copy: dict.chat.copyCode,
          copied: dict.chat.codeCopied,
          linkOpen: dict.chat.linkOpen,
          linkCancel: dict.chat.linkCancel,
          linkConfirmHint: dict.chat.linkConfirmHint,
          linkPreviewError: dict.chat.linkPreviewError,
        }}
      >
      {/* `relative` : repère des éléments `absolute` sans ancêtre positionné, notamment les `sr-only` du fil de discussion.
          Sans lui, leur repère est la FENÊTRE : `overflow-hidden` ne les rogne pas et, dans une longue conversation, ils
          allongent la page (constaté : 5 444 px pour 903 de fenêtre) — la fenêtre défile, l'espace de travail glisse
          vers le haut et laisse un vide en bas. */}
      <div className="relative flex h-dvh overflow-hidden bg-page">
        <Sidebar
          lang={lang}
          labels={dict.sidebar}
          projectLabels={dict.projects}
          languageLabel={languageLabel}
          account={account}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <OfflineBanner label={dict.offline} />
          {/* Sous xl, le panneau latéral est masqué : barre avec menu (mobile) et connecteurs. */}
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 xl:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label={dict.sidebar.open}
              aria-expanded={sidebarOpen}
              className="flex size-9 items-center justify-center rounded-button text-ink-2 hover:bg-active hover:text-ink lg:hidden"
            >
              <MenuIcon />
            </button>
            <span className="lg:hidden">
              <DonnaLockup size={26} signature={false} />
            </span>
            <ConnectorsMenu lang={lang} dict={dict} connectors={connectors} />
          </header>
          {children}
        </main>
        <SidePanel lang={lang} dict={dict} connectors={connectors} />
        {/* Dans la rangée flex : le volet d'aperçu partage la largeur en colonne sur grand écran
            (comme le volet Document) et se superpose en plein écran sous lg. */}
        <FileViewer lang={lang} labels={dict.viewer} />
      </div>
      <SearchPalette lang={lang} labels={dict.sidebar} />
      <SettingsDialog lang={lang} dict={dict} account={account} connectors={connectors} oauthProviders={oauthProviders} />
      <ReminderToasts lang={lang} labels={dict.reminders} />
      <OAuthLinkNotice labels={dict.oauthLink} />
      <ThemeSync />
      </MarkdownLabelsProvider>
    </WorkspaceProvider>
    </ConnectorsProvider>
  );
}

function ConnectorsMenu({ lang, dict, connectors }: { lang: Locale; dict: Dictionary["workspace"]; connectors: ConnectorsOut | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const google = connectors?.google;
  const connectedCount = [google?.gmail, google?.calendar, google?.drive].filter(Boolean).length;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-button border border-border bg-surface px-3 py-2 text-label font-medium text-ink hover:border-ink-3/40"
      >
        {dict.panel.connectors}
        <span className={`size-1.5 rounded-full ${connectedCount ? "bg-success" : "bg-danger"}`} />
        <ChevronIcon size={15} className={`text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 w-[20rem] overflow-hidden rounded-panel bg-surface shadow-float">
          <p className="border-b border-border px-4 py-3 text-panel-title font-medium text-ink">{dict.panel.connectors}</p>
          <ConnectorRows lang={lang} dict={dict} connectors={connectors} />
        </div>
      )}
    </div>
  );
}
