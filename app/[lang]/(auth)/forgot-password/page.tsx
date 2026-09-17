import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ForgotForm, Heading } from "@/components/auth/forms";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/forgot-password">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).auth.forgot.title } : {};
}

export default async function ForgotPasswordPage({ params }: PageProps<"/[lang]/forgot-password">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <div className="flex flex-col gap-7">
      <Heading title={dict.auth.forgot.title} intro={dict.auth.forgot.intro} />
      <ForgotForm lang={lang} auth={dict.auth} />
    </div>
  );
}
