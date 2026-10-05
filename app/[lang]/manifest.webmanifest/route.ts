import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "../dictionaries";

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

/**
 * Manifeste de l'application installable, par langue : « Installer » ouvre ensuite DONNA dans la langue où elle a été
 * installée. Public (aucune donnée de compte) ; l'identité de l'application (`id`) est la même dans les deux langues, pour
 * qu'elle ne s'installe pas deux fois.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) return new Response("Not found", { status: 404 });
  const dict = await getDictionary(lang);

  return Response.json(
    {
      id: "/",
      name: "DONNA",
      short_name: "DONNA",
      description: dict.meta.description,
      lang,
      dir: "ltr",
      start_url: `/${lang}/app`,
      scope: "/",
      display: "standalone",
      background_color: "#fbfafa",
      theme_color: "#591a29",
      categories: ["productivity", "business"],
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
