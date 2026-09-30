import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DonnaLockup } from "@/components/brand/donna-mark";
import { LanguageSwitch } from "@/components/language-switch";
import { AcceptInviteButton } from "@/components/workspace/accept-invite-button";
import { isLocale } from "@/i18n/config";
import { getWorkspaceInvitePreview } from "@/lib/backend";
import { getClaims } from "@/lib/api";
import { getDictionary } from "../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/invitation">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).workspaceInvite.title } : {};
}

/** Page "Rejoindre un espace" — lien envoyé par email (backend/app/xauth/src/services/email/senders/invite.py::send_invitation).
 * Le lien est sans langue ({web_url}/invitation?token=...) ; proxy.ts redirige vers /fr ou /en en préservant le token. */
export default async function WorkspaceInvitePage({ params, searchParams }: PageProps<"/[lang]/invitation">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : undefined;
  const [dict, preview, claims] = await Promise.all([
    getDictionary(lang),
    token ? getWorkspaceInvitePreview(token) : Promise.resolve(null),
    getClaims(),
  ]);
  const t = dict.workspaceInvite;
  const next = `/${lang}/invitation?token=${encodeURIComponent(token ?? "")}`;

  let body: React.ReactNode;
  if (!token) {
    body = <p className="text-message text-ink-2">{t.missingToken}</p>;
  } else if (!preview || !preview.valid) {
    body = <p className="text-message text-ink-2">{t.notFoundOrInvalid}</p>;
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
    body = <AcceptInviteButton lang={lang} token={token} labels={t} endpoint="/api/donna/auth/invites/accept" />;
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
        {preview?.valid && (
          <p className="mt-2 text-message text-ink-2 text-pretty">{t.intro.replace("{tenant}", preview.tenant_name)}</p>
        )}
        <div className="mt-5">{body}</div>
      </div>
    </div>
  );
}
