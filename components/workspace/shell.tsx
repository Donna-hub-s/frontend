"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { DonnaLockup } from "@/components/brand/donna-mark";
import type { ConnectorsOut, ConversationOut, PendingActionOut } from "@/lib/workspace-types";
import { ChevronIcon, MenuIcon } from "./icons";
import { SearchPalette } from "./search-palette";
import { ConnectorRows, SidePanel } from "./side-panel";
import { Sidebar, type Account } from "./sidebar";
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
  children,
}: {
  lang: Locale;
  dict: Dictionary["workspace"];
  languageLabel: string;
  account: Account;
  connectors: ConnectorsOut | null;
  conversations: ConversationOut[];
  pending: PendingActionOut[];
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <WorkspaceProvider initialConversations={conversations} initialPending={pending}>
      <div className="flex h-dvh overflow-hidden bg-page">
        <Sidebar
          lang={lang}
          labels={dict.sidebar}
          languageLabel={languageLabel}
          account={account}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
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
      </div>
      <SearchPalette lang={lang} labels={dict.sidebar} />
    </WorkspaceProvider>
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
        className="inline-flex items-center gap-2 rounded-button border border-border bg-white px-3 py-2 text-label font-medium text-ink hover:border-ink-3/40"
      >
        {dict.panel.connectors}
        <span className={`size-1.5 rounded-full ${connectedCount ? "bg-success" : "bg-danger"}`} />
        <ChevronIcon size={15} className={`text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 w-[20rem] overflow-hidden rounded-panel bg-white shadow-float">
          <p className="border-b border-border px-4 py-3 text-panel-title font-medium text-ink">{dict.panel.connectors}</p>
          <ConnectorRows lang={lang} dict={dict} connectors={connectors} />
        </div>
      )}
    </div>
  );
}
