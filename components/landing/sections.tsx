import Image from "next/image";
import { DonnaLockup } from "@/components/brand/donna-mark";
import { LanguageSwitch } from "@/components/language-switch";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { FeatureExplorer } from "./feature-explorer";
import { GoogleButton } from "./hero";
import { Reveal } from "./reveal";

type SectionProps = { lang: Locale; dict: Dictionary };

const sectionTitle =
  "font-brand text-[clamp(2.125rem,4vw,3.25rem)] leading-[1.08] font-light tracking-[-0.01em] text-brand-strong text-balance";

export function Features({ dict }: SectionProps) {
  return (
    <section id="fonctionnalites" className="scroll-mt-6 bg-ivoire-50 py-20 lg:py-28">
      <div className="mx-auto w-full max-w-[1200px] px-6 md:px-10">
        <Reveal className="max-w-[40rem]">
          <h2 className={sectionTitle}>{dict.features.title}</h2>
          <p className="mt-5 text-[1.0625rem] leading-7 text-ink-2 text-pretty">{dict.features.intro}</p>
        </Reveal>
        <Reveal className="mt-12 lg:mt-16" delay={120}>
          <FeatureExplorer features={dict.features} alts={dict.illustrations} />
        </Reveal>
      </div>
    </section>
  );
}

/** Trois étapes réelles, dans l'ordre : la numérotation porte une information. */
export function HowItWorks({ dict }: SectionProps) {
  const alts = dict.illustrations as Record<string, string>;
  return (
    <section id="comment" className="scroll-mt-6 mx-auto w-full max-w-[1200px] px-6 py-20 md:px-10 lg:py-28">
      <Reveal>
        <h2 className={sectionTitle}>{dict.how.title}</h2>
      </Reveal>
      <ol className="mt-12 grid gap-12 md:grid-cols-3 md:gap-8 lg:mt-16">
        {dict.how.steps.map((step, index) => (
          <li key={step.title}>
            <Reveal delay={index * 140} className="flex h-full flex-col">
              <div className="flex h-52 items-end justify-center">
                <Image
                  src={`/illustrations/${step.image}.svg`}
                  alt={alts[step.image] ?? ""}
                  width={300}
                  height={220}
                  className="h-auto max-h-52 w-auto max-w-full"
                />
              </div>
              <div className="mt-8 flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-fill font-brand text-[0.9375rem] text-white">
                  {index + 1}
                </span>
                <h3 className="text-[1.1875rem] leading-7 font-medium text-ink text-balance">{step.title}</h3>
              </div>
              <p className="mt-3 text-message text-ink-2 text-pretty">{step.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Tick({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden className={`mt-1 shrink-0 ${className}`}>
      <path d="M4 10.5l3.5 3.5L16 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Particuliers et entreprises : ce qui existe aujourd'hui, et ce qui arrive (marqué « Bientôt »). */
export function Audience({ dict }: SectionProps) {
  const { audience } = dict;
  const alts = dict.illustrations as Record<string, string>;
  const columns = [audience.personal, audience.business];
  return (
    <section id="pour-qui" className="scroll-mt-6 mx-auto w-full max-w-[1200px] px-6 py-20 md:px-10 lg:py-28">
      <Reveal className="max-w-[40rem]">
        <h2 className={sectionTitle}>{audience.title}</h2>
        <p className="mt-5 text-[1.0625rem] leading-7 text-ink-2 text-pretty">{audience.intro}</p>
      </Reveal>
      <div className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-2">
        {columns.map((column, index) => {
          const business = index === 1;
          return (
            <Reveal
              key={column.label}
              delay={index * 140}
              className={`flex flex-col rounded-[24px] p-8 md:p-10 ${business ? "bg-brand-fill-strong text-white" : "bg-surface shadow-card"}`}
            >
              <div className={`flex h-48 items-end justify-center rounded-panel px-4 pt-4 ${business ? "bg-ivoire-50" : ""}`}>
                <Image
                  src={`/illustrations/${column.image}.svg`}
                  alt={alts[column.image] ?? ""}
                  width={300}
                  height={200}
                  className="h-auto max-h-44 w-auto max-w-full"
                />
              </div>
              <p className={`mt-8 text-label font-medium ${business ? "text-rose-300" : "text-brand"}`}>{column.label}</p>
              <h3
                className={`mt-1 font-brand text-[clamp(1.625rem,2.6vw,2rem)] leading-[1.15] font-light text-balance ${
                  business ? "text-white" : "text-brand-strong"
                }`}
              >
                {column.title}
              </h3>
              <ul className="mt-6 flex flex-col gap-3">
                {column.points.map((point) => (
                  <li key={point} className={`flex gap-3 text-message ${business ? "text-peche-100/90" : "text-ink-2"}`}>
                    <Tick className={business ? "text-rose-300" : "text-brand"} />
                    <span className="text-pretty">{point}</span>
                  </li>
                ))}
              </ul>
              {business && (
                <div className="mt-8 rounded-card border border-white/15 p-5">
                  <p className="inline-flex rounded-badge bg-rose-300 px-2 py-0.5 text-meta font-medium text-brand-strong">
                    {audience.soon.label}
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {audience.soon.items.map((item) => (
                      <li key={item} className="text-secondary text-peche-100/80 text-pretty">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export function Security({ dict }: SectionProps) {
  return (
    <section id="securite" className="scroll-mt-6 bg-brand-fill-strong py-20 text-peche-100 lg:py-28">
      <div className="mx-auto w-full max-w-[1200px] px-6 md:px-10">
        <Reveal className="grid items-end gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <div>
            <h2 className="font-brand text-[clamp(2.125rem,4vw,3.25rem)] leading-[1.08] font-light tracking-[-0.01em] text-white text-balance">
              {dict.security.title}
            </h2>
            <p className="mt-5 max-w-[34rem] text-[1.0625rem] leading-7 text-peche-100/85 text-pretty">{dict.security.body}</p>
          </div>
          <div className="flex justify-center rounded-panel bg-ivoire-50 px-6 pt-8">
            <Image
              src="/illustrations/security.svg"
              alt={dict.illustrations.security}
              width={360}
              height={260}
              className="h-auto max-h-56 w-auto max-w-full"
            />
          </div>
        </Reveal>
        <ul className="mt-14 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {dict.security.items.map((item, index) => (
            <li key={item.title}>
              <Reveal delay={index * 80} className="border-t border-white/15 pt-5">
                <p className="text-[1.0625rem] leading-7 font-medium text-white">{item.title}</p>
                <p className="mt-1.5 text-message text-peche-100/80 text-pretty">{item.body}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Faq({ dict }: SectionProps) {
  return (
    <section
      id="questions"
      className="scroll-mt-6 mx-auto grid w-full max-w-[1200px] gap-12 px-6 py-20 md:px-10 lg:grid-cols-[0.8fr_1.2fr] lg:py-28"
    >
      <h2 className={`${sectionTitle} lg:sticky lg:top-12 lg:self-start`}>{dict.faq.title}</h2>
      <div className="border-t border-border">
        {dict.faq.items.map((item) => (
          <details key={item.q} className="faq-item group border-b border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-button py-5 text-[1.0625rem] leading-7 font-medium text-ink [&::-webkit-details-marker]:hidden">
              {item.q}
              <svg
                viewBox="0 0 20 20"
                width="20"
                height="20"
                aria-hidden
                className="shrink-0 text-brand transition-transform duration-(--duration-standard) group-open:rotate-45"
              >
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </summary>
            <p className="max-w-[36rem] pb-6 text-message text-ink-2 text-pretty">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FinalCta({ lang, dict }: SectionProps) {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-6 pb-24 md:px-10">
      <Reveal className="grid items-center gap-10 rounded-[28px] bg-surface px-8 py-14 shadow-card md:px-14 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h2 className={sectionTitle}>{dict.cta.title}</h2>
          <p className="mt-4 max-w-[30rem] text-[1.0625rem] leading-7 text-ink-2 text-pretty">{dict.cta.body}</p>
          <div className="mt-8">
            <GoogleButton href={`/oauth/google?lang=${lang}`} label={dict.cta.button} />
          </div>
        </div>
        <Image
          src="/illustrations/relax.svg"
          alt={dict.illustrations.relax}
          width={360}
          height={300}
          className="mx-auto h-auto w-full max-w-[20rem]"
        />
      </Reveal>
    </section>
  );
}

export function LandingFooter({ lang, dict }: SectionProps) {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 py-10 md:flex-row md:items-center md:justify-between md:px-10">
        <div className="flex flex-col gap-3">
          <DonnaLockup size={30} />
          <p className="max-w-[26rem] text-secondary text-ink-2">{dict.footer.tagline}</p>
        </div>
        <div className="flex items-center gap-6">
          <LanguageSwitch current={lang} label={dict.language.label} />
          <p className="text-meta text-ink-3">{dict.footer.legal}</p>
        </div>
      </div>
    </footer>
  );
}
