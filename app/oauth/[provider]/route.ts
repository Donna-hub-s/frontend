import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { BACKEND_URL, getOAuthProviders } from "@/lib/backend";
import { COOKIES } from "@/lib/session-cookies";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

/** Adresse publique de l'API (le navigateur y est envoyé) ; identique à DONNA_API_URL hors conteneurs. */
const PUBLIC_BACKEND_URL = (process.env.DONNA_API_PUBLIC_URL ?? BACKEND_URL).replace(/\/$/, "");
const PROVIDERS = new Set(["google", "microsoft", "github", "discord"]);

/**
 * Démarre un flux OAuth.
 * - Connexion : xauth redirige vers le fournisseur puis revient sur /auth (voir app/auth/route.ts).
 * - Liaison (?link=1, utilisateur connecté) : xauth associe le fournisseur à CE compte
 *   (appel authentifié, voir routes/oauth.py::authorize) puis revient sur l'espace de travail.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/oauth/[provider]">) {
  const { provider } = await params;
  const langParam = request.nextUrl.searchParams.get("lang");
  const lang = isLocale(langParam) ? langParam : "fr";
  const link = request.nextUrl.searchParams.get("link") === "1";

  // Fournisseur inconnu ou non configuré côté backend : retour avec un message explicite.
  if (!PROVIDERS.has(provider) || !(await getOAuthProviders()).includes(provider)) {
    return NextResponse.redirect(new URL(link ? `/${lang}/app` : `/${lang}/login?error=oauth`, request.url));
  }

  let target = `${PUBLIC_BACKEND_URL}/app/auth/oauth/${provider}/authorize?direct=true`;
  if (link) {
    const token = (await cookies()).get(COOKIES.access)?.value;
    if (!token) return NextResponse.redirect(new URL(`/${lang}/login?next=/${lang}/app`, request.url));
    const back = encodeURIComponent(new URL(`/${lang}/app`, request.url).toString());
    const authUrl = await fetch(`${BACKEND_URL}/app/auth/oauth/${provider}/authorize?redirect=${back}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => (typeof data?.auth_url === "string" ? data.auth_url : null))
      .catch(() => null);
    if (!authUrl) return NextResponse.redirect(new URL(`/${lang}/app`, request.url));
    target = authUrl;
  }

  const response = NextResponse.redirect(target);
  response.cookies.set(LOCALE_COOKIE, lang, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  return response;
}
