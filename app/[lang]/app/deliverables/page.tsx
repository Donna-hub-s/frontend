import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeliverablesPage } from "@/components/workspace/deliverables-page";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/deliverables">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).workspace.deliverables.indexTitle } : {};
}

export default async function DeliverablesRoute({ params }: PageProps<"/[lang]/app/deliverables">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return <DeliverablesPage lang={lang} labels={dict.workspace.deliverables} />;
}
