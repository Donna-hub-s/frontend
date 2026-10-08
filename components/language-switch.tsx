"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALE_COOKIE, type Locale, locales } from "@/i18n/config";

type Props = { current: Locale; label: string; className?: string };

/** FR | EN : garde la page courante, mémorise le choix (cookie lu par proxy.ts). */
export function LanguageSwitch({ current, label, className = "" }: Props) {
  const pathname = usePathname();
  const rest = pathname.replace(/^\/(fr|en)(?=\/|$)/, "");

  return (
    <nav aria-label={label} className={`flex items-center gap-1 ${className}`}>
      {locales.map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={`/${locale}${rest}`}
            hrefLang={locale}
            lang={locale}
            aria-current={active ? "true" : undefined}
            onClick={() => {
              document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
            }}
            className={`rounded-badge px-2 py-1 text-caps font-medium uppercase no-underline transition-colors duration-(--duration-fast) ${
              active ? "bg-active text-bordeaux-900" : "text-ink-2 hover:text-bordeaux-900"
            }`}
          >
            {locale}
          </Link>
        );
      })}
    </nav>
  );
}
