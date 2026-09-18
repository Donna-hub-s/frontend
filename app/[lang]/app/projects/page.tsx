import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectsIndex } from "@/components/workspace/projects-index";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/projects">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).workspace.projects.indexTitle } : {};
}

export default async function ProjectsIndexPage({ params }: PageProps<"/[lang]/app/projects">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return <ProjectsIndex lang={lang} labels={dict.workspace.projects} />;
}
