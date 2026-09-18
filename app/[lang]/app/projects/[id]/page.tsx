import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectDetail } from "@/components/workspace/project-detail";
import { isLocale } from "@/i18n/config";
import {
  getClaims,
  getProject,
  listConversations,
  listProjectDocuments,
  listProjectFacts,
  listProjectInvites,
  listProjectMembers,
} from "@/lib/api";
import { getDictionary } from "../../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/projects/[id]">): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isLocale(lang)) return {};
  const project = await getProject(id);
  return { title: project?.name ?? (await getDictionary(lang)).workspace.projects.notFound };
}

export default async function ProjectPage({ params }: PageProps<"/[lang]/app/projects/[id]">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, project, members, claims, conversations, facts, documents] = await Promise.all([
    getDictionary(lang),
    getProject(id),
    listProjectMembers(id),
    getClaims(),
    listConversations(id),
    listProjectFacts(id),
    listProjectDocuments(id),
  ]);
  if (!project) notFound();

  // Les invitations sont owner-only côté backend — inutile d'appeler pour les autres rôles.
  const invites = project.my_role === "owner" ? await listProjectInvites(id) : [];

  return (
    <ProjectDetail
      lang={lang}
      dict={dict.workspace}
      project={project}
      initialMembers={members}
      initialInvites={invites}
      initialConversations={conversations}
      initialFacts={facts}
      initialDocuments={documents}
      currentUserId={claims?.sub ?? ""}
    />
  );
}
