import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, isLocale, locales, negotiateLocale } from "./i18n/config";
import { COOKIES, MAX_AGE, cookieOptions } from "./lib/session-cookies";

const BACKEND_URL = (process.env.DONNA_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

/**
 * 1. Pages de l'application (/fr/app…) : contrôle optimiste de session. Jeton d'accès expiré
 *    mais refresh token présent : renouvellement ici, avant le rendu (un Server Component
 *    ne peut pas écrire de cookie). Sans session : retour à la connexion.
 * 2. Toute URL sans préfixe de langue est redirigée vers /fr/... ou /en/... :
 * d'abord le choix mémorisé (cookie), sinon la langue du navigateur.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const lang = locales.find((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
  if (lang) {
    const isApp = pathname === `/${lang}/app` || pathname.startsWith(`/${lang}/app/`);
    return isApp ? guardApp(request, lang) : undefined;
  }

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : negotiateLocale(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

async function guardApp(request: NextRequest, lang: string) {
  if (request.cookies.has(COOKIES.access)) return NextResponse.next();

  const refreshToken = request.cookies.get(COOKIES.refresh)?.value;
  const login = request.nextUrl.clone();
  login.pathname = `/${lang}/login`;
  login.search = "";
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  if (!refreshToken) return NextResponse.redirect(login);

  const tokens = await fetch(`${BACKEND_URL}/app/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  if (!tokens?.access_token) {
    login.searchParams.set("error", "sessionExpired");
    const response = NextResponse.redirect(login);
    response.cookies.delete(COOKIES.refresh);
    return response;
  }

  // Le rendu en cours lit déjà les nouveaux jetons ; le navigateur les reçoit dans la réponse.
  request.cookies.set(COOKIES.access, tokens.access_token);
  request.cookies.set(COOKIES.refresh, tokens.refresh_token);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(COOKIES.access, tokens.access_token, cookieOptions(MAX_AGE.access));
  response.cookies.set(COOKIES.refresh, tokens.refresh_token, cookieOptions(MAX_AGE.refresh));
  return response;
}

export const config = {
  // Ni les fichiers internes de Next, ni les ressources statiques (tout chemin avec extension),
  // ni les routes techniques (/api/…, /auth, /oauth/…), qui ne sont pas des pages traduites.
  matcher: ["/((?!_next|api/|auth$|auth/|oauth/|.*\\..*).*)"],
};
