import { notFound } from "next/navigation";
import { Conversation } from "@/components/workspace/conversation";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/lib/api";
import { accountIdentity } from "@/lib/workspace-server";
import { toChatMessages } from "@/lib/workspace-types";
import { getDictionary } from "../../../dictionaries";

/** Conversation existante : historique chargé côté serveur. */
export default async function ConversationPage({ params }: PageProps<"/[lang]/app/c/[id]">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();
  const [dict, identity, messages] = await Promise.all([getDictionary(lang), accountIdentity(), getMessages(id)]);

  return (
    <Conversation
      key={id}
      lang={lang}
      dict={dict.workspace}
      conversationId={id}
      initialMessages={messages ? toChatMessages(messages) : []}
      firstName={identity.firstName}
      initials={identity.initials}
      loadError={messages === null}
    />
  );
}
