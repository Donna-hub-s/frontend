// Langues de l'interface. Le français est la langue par défaut (produit francophone d'abord).
export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";

/** Cookie posé quand l'utilisateur choisit une langue : il prime sur le navigateur. */
export const LOCALE_COOKIE = "donna-locale";

export const isLocale = (value: string | undefined | null): value is Locale =>
  !!value && (locales as readonly string[]).includes(value);

export const localeNames: Record<Locale, string> = { fr: "Français", en: "English" };

/**
 * Langue préférée d'après l'en-tête Accept-Language (q-values respectées),
 * sans dépendance : « fr-CA,fr;q=0.9,en;q=0.8 » -> "fr".
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { base: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.split("=")[1]) || 0 : 1 };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.find((entry) => isLocale(entry.base))?.base as Locale | undefined ?? defaultLocale;
}
