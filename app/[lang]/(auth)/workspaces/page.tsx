import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Heading, WorkspacePicker } from "@/components/auth/forms";
import { isLocale } from "@/i18n/config";
import { readTenants } from "@/lib/session";
import { COOKIES } from "@/lib/session-cookies";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/workspaces">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).auth.workspaces.title } : {};
}

/** Compte membre de plusieurs espaces : choix avant d'émettre un jeton d'accès. */
export default async function WorkspacesPage({ params }: PageProps<"/[lang]/workspaces">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const store = await cookies();
  const tenants = readTenants(store);
  if (!store.has(COOKIES.pending) || !tenants.length) redirect(`/${lang}/login?error=sessionExpired`);
  const dict = await getDictionary(lang);

  return (
    <div className="flex flex-col gap-7">
      <Heading title={dict.auth.workspaces.title} intro={dict.auth.workspaces.intro} />
      <WorkspacePicker lang={lang} auth={dict.auth} tenants={tenants} />
    </div>
  );
}
