import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { LoginForm } from "@/components/auth/forms";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { isLocale } from "@/i18n/config";
import { isAuthErrorKey } from "@/lib/auth-rules";
import { getOAuthProviders } from "@/lib/backend";
import { COOKIES } from "@/lib/session-cookies";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/login">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: (await getDictionary(lang)).auth.login.title } : {};
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [dict, providers, query] = await Promise.all([getDictionary(lang), getOAuthProviders(), searchParams]);
  const error = isAuthErrorKey(query.error, dict.auth.errors) ? query.error : undefined;
  const next = typeof query.next === "string" ? query.next : undefined;
  const mfaPending = query.step === "mfa" && (await cookies()).has(COOKIES.mfa);
// return login form with oauth buttons and error message if any
  return (
    <LoginForm
      lang={lang}
      auth={dict.auth}
      next={next}
      initialError={error}
      initialStep={mfaPending ? "mfa" : undefined}
      oauth={<OAuthButtons providers={providers} lang={lang} dict={dict} />}
    />
  );
}
