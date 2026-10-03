import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UsagePage } from "@/components/workspace/usage-page";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/usage">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).workspace.usage.indexTitle } : {};
}

export default async function UsageRoute({ params }: PageProps<"/[lang]/app/usage">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return <UsagePage lang={lang} labels={dict.workspace.usage} />;
}
