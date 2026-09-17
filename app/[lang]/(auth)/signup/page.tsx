import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Heading, SignupForm } from "@/components/auth/forms";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { isLocale } from "@/i18n/config";
import { getOAuthProviders } from "@/lib/backend";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/signup">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).auth.signup.title } : {};
}

export default async function SignupPage({ params }: PageProps<"/[lang]/signup">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [dict, providers] = await Promise.all([getDictionary(lang), getOAuthProviders()]);

  return (
    <div className="flex flex-col gap-7">
      <Heading title={dict.auth.signup.title} intro={dict.auth.signup.intro} />
      <OAuthButtons providers={providers} lang={lang} dict={dict} />
      <SignupForm lang={lang} auth={dict.auth} />
    </div>
  );
}
