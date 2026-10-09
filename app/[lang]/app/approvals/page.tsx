import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApprovalsPage } from "@/components/workspace/approvals-page";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/approvals">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).workspace.approvals.title, robots: { index: false } } : {};
}

export default async function ApprovalsRoute({ params }: PageProps<"/[lang]/app/approvals">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return <ApprovalsPage lang={lang} dict={dict.workspace} />;
}
