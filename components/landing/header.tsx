import Link from "next/link";
import { DonnaLockup } from "@/components/brand/donna-mark";
import { LanguageSwitch } from "@/components/language-switch";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";

export function LandingHeader({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-[1200px] items-center justify-between gap-6 px-6 py-5 md:px-10">
      <Link href={`/${lang}`} className="no-underline" aria-label="DONNA">
        <DonnaLockup size={34} />
      </Link>

      <div className="flex items-center gap-2 md:gap-6">
        <nav aria-label={dict.nav.label} className="hidden items-center gap-7 lg:flex">
          {(
            [
              ["#fonctionnalites", dict.nav.features],
              ["#pour-qui", dict.nav.audience],
              ["#securite", dict.nav.security],
              ["#questions", dict.nav.faq],
            ] as const
          ).map(([href, text]) => (
            <a key={href} href={href} className="text-label text-ink-2 no-underline hover:text-bordeaux-900">
              {text}
            </a>
          ))}
        </nav>
        <LanguageSwitch current={lang} label={dict.language.label} />
        <Link
          href={`/${lang}/login`}
          className="hidden text-label font-medium text-ink no-underline hover:text-bordeaux-900 sm:inline"
        >
          {dict.nav.signIn}
        </Link>
        <Link
          href={`/${lang}/signup`}
          className="rounded-button bg-bordeaux-700 px-4 py-2.5 text-label font-medium text-white no-underline transition-colors duration-(--duration-fast) hover:bg-bordeaux-900 hover:text-white"
        >
          {dict.nav.start}
        </Link>
      </div>
    </header>
  );
}
