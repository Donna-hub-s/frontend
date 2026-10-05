import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "./dictionaries";
import { PwaRegister } from "@/components/pwa-register";
import "../globals.css";

// Polices auto-hébergées (fichiers variables @fontsource-variable 5.3.0, licence OFL 1.1) :
// aucune dépendance réseau au build, contrairement à next/font/google.
// Figtree : interface. Jost : marque et grands titres.
const figtree = localFont({
  src: "../fonts/figtree-variable-latin.woff2",
  weight: "300 900",
  variable: "--font-figtree",
  display: "swap",
});
const jost = localFont({
  src: "../fonts/jost-variable-latin.woff2",
  weight: "100 900",
  variable: "--font-jost",
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

// Couleur de la barre du navigateur / de l'application installée : le bordeaux de la marque.
export const viewport: Viewport = { themeColor: "#591a29" };

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    title: { default: dict.meta.title, template: "%s · DONNA" },
    description: dict.meta.description,
    alternates: { languages: Object.fromEntries(locales.map((l) => [l, `/${l}`])) },
    // Application installable (voir public/sw.js) : manifeste dans la langue de la page, icônes, mode « application » sur iOS.
    manifest: `/${lang}/manifest.webmanifest`,
    applicationName: "DONNA",
    appleWebApp: { capable: true, title: "DONNA", statusBarStyle: "default" },
    icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <html lang={lang} className={`${figtree.variable} ${jost.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
