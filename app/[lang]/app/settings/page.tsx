import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";

/** Les paramètres s'ouvrent en fenêtre dans l'espace de travail (settings-dialog.tsx) :
 * cette adresse reste valable (favoris, liens d'emails) et y mène directement. */
export default async function SettingsPage({ params }: PageProps<"/[lang]/app/settings">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  redirect(`/${lang}/app?settings=1`);
}
