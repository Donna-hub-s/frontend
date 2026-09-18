import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/shell";
import { isLocale } from "@/i18n/config";
import { getClaims, getConnectors, getTenant, listConversations, listPendingActions, listProjects } from "@/lib/api";
import { accountIdentity } from "@/lib/workspace-server";
import { getDictionary } from "../dictionaries";

/** URL ws(s)://... visible du navigateur, dérivée de la même base publique que
 * l'OAuth (voir app/oauth/[provider]/route.ts) — jamais le jeton d'accès
 * lui-même (httpOnly), juste l'hôte : la connexion s'authentifie via un
 * ticket à usage unique (voir lib/use-project-ws.ts). */
function wsBaseUrl(): string | null {
  const publicUrl = process.env.DONNA_API_PUBLIC_URL || process.env.DONNA_API_URL || "http://localhost:8000";
  if (!/^https?:\/\//.test(publicUrl)) return null;
  return publicUrl.replace(/\/$/, "").replace(/^http/, "ws");
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]/app">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).workspace.meta.title, robots: { index: false } } : {};
}

/** Espace de travail (protégé par proxy.ts) : données initiales chargées côté serveur, en parallèle. */
export default async function WorkspaceLayout({ children, params }: LayoutProps<"/[lang]/app">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const claims = await getClaims();
  const [dict, conversations, pending, identity, connectors, tenant, projects] = await Promise.all([
    getDictionary(lang),
    listConversations(),
    listPendingActions(),
    accountIdentity(),
    getConnectors(),
    claims?.tenant_id ? getTenant(claims.tenant_id) : Promise.resolve(null),
    listProjects(),
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
      projects={projects}
      wsBaseUrl={wsBaseUrl()}
    >
      {children}
    </WorkspaceShell>
  );
}
