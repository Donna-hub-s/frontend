import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkflowsPage } from "@/components/workspace/workflows-page";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/workflows">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).workspace.workflows.indexTitle } : {};
}

export default async function WorkflowsRoute({ params }: PageProps<"/[lang]/app/workflows">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return <WorkflowsPage lang={lang} labels={dict.workspace.workflows} agentLabels={dict.workspace.workflowAgents} />;
}
