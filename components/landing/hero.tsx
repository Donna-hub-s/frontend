import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { HeroDemo } from "./hero-demo";

export function GoogleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden className={className}>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.97 8.97 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export function GoogleButton({ href, label }: { href: string; label: string }) {
  return (
    // Lien de navigation complet (pas de préchargement) : /oauth/… redirige hors du site.
    <a
      href={href}
      className="inline-flex items-center gap-3 rounded-button bg-brand-fill py-3 pr-5 pl-3.5 text-label font-medium text-white no-underline transition-colors duration-(--duration-fast) hover:bg-brand-fill-strong hover:text-white"
    >
      <span className="inline-flex size-7 items-center justify-center rounded-badge bg-surface">
        <GoogleIcon />
      </span>
      {label}
    </a>
  );
}

export function Hero({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute top-0 right-0 hidden h-[40rem] w-[min(52rem,62vw)] rounded-bl-[50%] bg-peche-100/70 lg:block"
      />
      <div className="relative mx-auto grid w-full max-w-[1200px] items-center gap-14 px-6 pt-10 pb-20 md:px-10 lg:grid-cols-[1fr_30rem] lg:gap-16 lg:pt-14 lg:pb-24">
        <div className="flex flex-col items-start">
          <h1 className="hero-title font-brand text-[clamp(2.75rem,6.2vw,4.75rem)] leading-[1.02] font-light tracking-[-0.015em] text-brand-strong text-balance">
            {dict.hero.title}
          </h1>
          <p className="mt-6 max-w-[34rem] text-[1.125rem] leading-[1.75rem] text-ink-2 text-pretty">{dict.hero.subtitle}</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <GoogleButton href={`/oauth/google?lang=${lang}`} label={dict.hero.ctaPrimary} />
            <a
              href="#fonctionnalites"
              className="text-label font-medium text-ink underline decoration-rose-300 decoration-2 underline-offset-6 hover:text-brand-strong"
            >
              {dict.hero.ctaSecondary}
            </a>
          </div>
          <p className="mt-6 max-w-[30rem] text-secondary text-ink-3">{dict.hero.note}</p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <HeroDemo demo={dict.demo} />
        </div>
      </div>
    </section>
  );
}
