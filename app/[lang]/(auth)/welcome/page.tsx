import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Heading, WelcomeForm } from "@/components/auth/forms";
import { isLocale } from "@/i18n/config";
import { COOKIES } from "@/lib/session-cookies";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/welcome">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).auth.welcome.title } : {};
}

/** Première connexion sans espace de travail (xauth needs_tenant_setup). */
export default async function WelcomePage({ params }: PageProps<"/[lang]/welcome">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  if (!(await cookies()).has(COOKIES.pending)) redirect(`/${lang}/login?error=sessionExpired`);
  const dict = await getDictionary(lang);

  return (
    <div className="flex flex-col gap-7">
      <Heading title={dict.auth.welcome.title} intro={dict.auth.welcome.intro} />
      <WelcomeForm lang={lang} auth={dict.auth} />
    </div>
  );
}
