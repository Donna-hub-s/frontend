import { notFound } from "next/navigation";
import { Conversation } from "@/components/workspace/conversation";
import { isLocale } from "@/i18n/config";
import { getProject } from "@/lib/api";
import { accountIdentity } from "@/lib/workspace-server";
import { getDictionary } from "../dictionaries";

/** Nouvelle conversation. L'identifiant arrive avec le premier événement du flux.
 * ?project=<id> : démarrée depuis une page de projet (voir project-detail.tsx),
 * rattache le premier message à ce projet — ignoré si l'utilisateur n'en est
 * pas membre (getProject renvoie alors null, même contrôle que le backend). */
export default async function NewConversationPage({ params, searchParams }: PageProps<"/[lang]/app">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const query = await searchParams;
  const projectParam = typeof query.project === "string" ? query.project : undefined;
  // ?agent=<id> : agent présélectionné (bouton « Essayer » d'un agent) — le serveur revérifie à chaque message.
  const agentParam = typeof query.agent === "string" ? query.agent : undefined;
  const [dict, identity, project] = await Promise.all([
    getDictionary(lang),
    accountIdentity(),
    projectParam ? getProject(projectParam) : Promise.resolve(null),
  ]);

  return (
    <Conversation
      lang={lang}
      dict={dict.workspace}
      conversationId={null}
      initialMessages={[]}
      firstName={identity.firstName}
      initials={identity.initials}
      projectId={project?.id}
      projectName={project?.name}
      initialAgentId={project ? agentParam : undefined}
    />
  );
}
