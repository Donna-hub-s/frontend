import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileSettingsForm } from "@/components/workspace/profile-settings";
import { isLocale } from "@/i18n/config";
import { getProfile } from "@/lib/api";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/settings">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).workspace.settings.title } : {};
}

export default async function SettingsPage({ params }: PageProps<"/[lang]/app/settings">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [dict, profile] = await Promise.all([getDictionary(lang), getProfile()]);

  return (
    <ProfileSettingsForm
      lang={lang}
      labels={dict.workspace.settings}
      initialProfile={
        profile ?? {
          display_name: null,
          avatar_url: null,
          timezone: "UTC",
          language: null,
          preferred_llm_provider: null,
          preferred_tts_voice: null,
          default_force_web_search: false,
          notify_reminders_email: false,
          notify_reminders_whatsapp: false,
          whatsapp_notify_number: null,
          created_at: "",
          updated_at: "",
        }
      }
    />
  );
}
