import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/auth/fields";
import { Heading, ResetForm } from "@/components/auth/forms";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/reset-password">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).auth.reset.title, robots: { index: false } } : {};
}

/** Lien reçu par email : /[lang]/reset-password?token=… */
export default async function ResetPasswordPage({ params, searchParams }: PageProps<"/[lang]/reset-password">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [dict, query] = await Promise.all([getDictionary(lang), searchParams]);
  const token = typeof query.token === "string" ? query.token : "";

  return (
    <div className="flex flex-col gap-7">
      <Heading title={dict.auth.reset.title} intro={dict.auth.reset.intro} />
      {token ? (
        <ResetForm lang={lang} auth={dict.auth} token={token} />
      ) : (
        <div className="flex flex-col gap-5">
          <FormAlert>{dict.auth.reset.missingToken}</FormAlert>
          <Link href={`/${lang}/forgot-password`} className="self-start text-label font-medium">
            {dict.auth.reset.requestNew}
          </Link>
        </div>
      )}
    </div>
  );
}
