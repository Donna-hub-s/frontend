import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { Audience, Faq, Features, FinalCta, HowItWorks, LandingFooter, Security } from "@/components/landing/sections";
import { getDictionary } from "./dictionaries";

export default async function LandingPage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <>
      <LandingHeader lang={lang} dict={dict} />
      <main>
        <Hero lang={lang} dict={dict} />
        <Features lang={lang} dict={dict} />
        <HowItWorks lang={lang} dict={dict} />
        <Audience lang={lang} dict={dict} />
        <Security lang={lang} dict={dict} />
        <Faq lang={lang} dict={dict} />
        <FinalCta lang={lang} dict={dict} />
      </main>
      <LandingFooter lang={lang} dict={dict} />
    </>
  );
}
