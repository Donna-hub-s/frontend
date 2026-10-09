import Link from "next/link";
import { notFound } from "next/navigation";
import { DonnaLockup, DonnaMark } from "@/components/brand/donna-mark";
import { LanguageSwitch } from "@/components/language-switch";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "../dictionaries";

/**
 * Pages de compte : formulaire à gauche, rappel de la promesse produit à droite (grand écran).
 * Le panneau reprend le brouillon en attente de la démo : ce que l'on retrouve une fois connecté.
 */
export default async function AuthLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const { panel } = dict.auth;
  const { demo } = dict;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
      <div className="flex flex-col px-6 py-5 md:px-10">
        <header className="flex items-center justify-between gap-4">
          <Link href={`/${lang}`} className="no-underline" aria-label={dict.auth.backHome}>
            <DonnaLockup size={32} />
          </Link>
          <LanguageSwitch current={lang} label={dict.language.label} />
        </header>
        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[24rem]">{children}</div>
        </main>
      </div>

      <aside
        aria-hidden
        className="relative m-3 hidden flex-col overflow-hidden rounded-[28px] bg-brand-fill-strong p-12 text-peche-100 lg:flex xl:p-14"
      >
        <div aria-hidden className="absolute -top-40 -right-40 size-[28rem] rounded-full bg-brand/40" />
        <div className="relative max-w-[26rem]">
          <p className="font-brand text-[clamp(2rem,3vw,2.75rem)] leading-[1.1] font-light text-white text-balance">
            {panel.title}
          </p>
          <p className="mt-4 text-[1.0625rem] leading-7 text-peche-100/85 text-pretty">{panel.body}</p>
        </div>

        <div className="relative flex flex-1 items-center py-10">
          <div className="flex items-start gap-3">
            <span className="mt-1 shrink-0">
              <DonnaMark size={30} variant="circle" label="" />
            </span>
            <div className="w-full max-w-[25rem] rounded-card bg-ivoire-50 p-5 text-ink shadow-float">
              <div className="flex items-center justify-between gap-3 text-meta">
                <span className="font-medium">{demo.draftLabel}</span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-brand">
                  <span className="pending-dot size-1.5 rounded-full bg-brand-fill" />
                  {demo.pending}
                </span>
              </div>
              <p className="mt-3 text-meta text-ink-3">{demo.to}</p>
              <p className="mt-0.5 text-secondary font-medium">{demo.subject}</p>
              <p className="mt-1.5 text-meta leading-5 text-ink-2">{demo.body}</p>
              <div className="mt-4 flex gap-2">
                <span className="rounded-button bg-brand-fill px-3 py-1.5 text-meta font-medium text-white">{demo.send}</span>
                <span className="rounded-button bg-fill px-3 py-1.5 text-meta font-medium">{demo.edit}</span>
              </div>
            </div>
          </div>
        </div>
        <p className="relative text-secondary text-peche-100/70">{panel.signature}</p>
      </aside>
    </div>
  );
}
