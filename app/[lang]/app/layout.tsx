import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/shell";
import { isLocale } from "@/i18n/config";
import { getClaims, getConnectors, getTenant, listConversations, listPendingActions } from "@/lib/api";
import { accountIdentity } from "@/lib/workspace-server";
import { getDictionary } from "../dictionaries";

export async function generateMetadata({ params }: LayoutProps<"/[lang]/app">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).workspace.meta.title, robots: { index: false } } : {};
}

/** Espace de travail (protégé par proxy.ts) : données initiales chargées côté serveur, en parallèle. */
export default async function WorkspaceLayout({ children, params }: LayoutProps<"/[lang]/app">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const claims = await getClaims();
  const [dict, conversations, pending, identity, connectors, tenant] = await Promise.all([
    getDictionary(lang),
    listConversations(),
    listPendingActions(),
    accountIdentity(),
    getConnectors(),
    claims?.tenant_id ? getTenant(claims.tenant_id) : Promise.resolve(null),
  ]);

  return (
    <WorkspaceShell
      lang={lang}
      dict={dict.workspace}
      languageLabel={dict.language.label}
      account={{ name: identity.name, email: identity.email, initials: identity.initials, workspace: tenant?.name ?? null }}
      connectors={connectors}
      conversations={conversations}
      pending={pending}
    >
      {children}
    </WorkspaceShell>
  );
}
