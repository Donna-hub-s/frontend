import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DonnaLockup } from "@/components/brand/donna-mark";
import { LanguageSwitch } from "@/components/language-switch";
import { AcceptInviteButton } from "@/components/workspace/accept-invite-button";
import { isLocale } from "@/i18n/config";
import { getInvitePreview } from "@/lib/backend";
import { getClaims } from "@/lib/api";
import { getDictionary } from "../../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/projects/invites/[token]">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).invite.title } : {};
}

export default async function InvitePage({ params }: PageProps<"/[lang]/projects/invites/[token]">) {
  const { lang, token } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, preview, claims] = await Promise.all([getDictionary(lang), getInvitePreview(token), getClaims()]);
  const t = dict.invite;
  const next = `/${lang}/projects/invites/${encodeURIComponent(token)}`;

  let body: React.ReactNode;
  if (!preview) {
    body = <p className="text-message text-ink-2">{t.notFound}</p>;
  } else if (preview.status === "expired") {
    body = <p className="text-message text-ink-2">{t.expired}</p>;
  } else if (preview.status !== "pending") {
    body = <p className="text-message text-ink-2">{t.alreadyHandled}</p>;
  } else if (!claims) {
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Link
            href={`/${lang}/login?next=${encodeURIComponent(next)}`}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-button bg-bordeaux-700 px-5 text-label font-medium text-white no-underline hover:bg-bordeaux-900"
          >
            {t.signIn}
          </Link>
          <Link
            href={`/${lang}/signup`}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-button border border-border px-5 text-label font-medium text-ink no-underline hover:bg-active"
          >
            {t.signUp}
          </Link>
        </div>
        <p className="text-secondary text-ink-3 text-pretty">{t.signUpHint}</p>
      </div>
    );
  } else if ((claims.email ?? "").trim().toLowerCase() !== preview.email.trim().toLowerCase()) {
    body = <p className="text-message text-danger text-pretty">{t.wrongEmail.replace("{email}", preview.email)}</p>;
  } else {
    body = <AcceptInviteButton lang={lang} token={token} labels={t} />;
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-10">
      <header className="flex w-full max-w-[26rem] items-center justify-between">
        <Link href={`/${lang}`} className="no-underline">
          <DonnaLockup size={30} />
        </Link>
        <LanguageSwitch current={lang} label={dict.language.label} />
      </header>
      <div className="w-full max-w-[26rem] rounded-panel bg-surface p-6 shadow-card">
        <h1 className="text-hero-sm font-medium text-ink">{t.title}</h1>
        {preview && preview.status === "pending" && (
          <p className="mt-2 text-message text-ink-2 text-pretty">
            {t.intro.replace("{project}", preview.project_name)}{" "}
            <span className="font-medium text-ink">
              {t.roleIntro} {preview.role}
            </span>
          </p>
        )}
        <div className="mt-5">{body}</div>
      </div>
    </div>
  );
}
