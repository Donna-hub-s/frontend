import { notFound } from "next/navigation";
import { Conversation } from "@/components/workspace/conversation";
import { isLocale } from "@/i18n/config";
import { accountIdentity } from "@/lib/workspace-server";
import { getDictionary } from "../dictionaries";

/** Nouvelle conversation. L'identifiant arrive avec le premier événement du flux. */
export default async function NewConversationPage({ params }: PageProps<"/[lang]/app">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [dict, identity] = await Promise.all([getDictionary(lang), accountIdentity()]);

  return (
    <Conversation
      lang={lang}
      dict={dict.workspace}
      conversationId={null}
      initialMessages={[]}
      firstName={identity.firstName}
      initials={identity.initials}
    />
  );
}
