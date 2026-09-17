import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE, isLocale, negotiateLocale } from "@/i18n/config";
import { applyTokens } from "@/lib/auth-flow";
import { COOKIES, MAX_AGE, cookieOptions } from "@/lib/session-cookies";
import type { TenantInfo } from "@/lib/backend";

/**
 * Retour du flux OAuth. xauth (routes/oauth.py::callback) redirige ici avec, selon le cas :
 * mfa_token (code de vérification en deux étapes attendu), access_token + refresh_token
 * (espace résolu), refresh_token + tenants (choix d'espace), refresh_token + onboarding
 * (espace à créer), ou error.
 * Les jetons passent aussitôt en cookies httpOnly, et l'URL qui les portait est remplacée.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const store = await cookies();
  const saved = store.get(LOCALE_COOKIE)?.value;
  const lang = isLocale(saved) ? saved : negotiateLocale(request.headers.get("accept-language"));

  if (params.get("error")) redirect(`/${lang}/login?error=oauth`);

  // Compte protégé : aucun jeton tant que le code n'est pas vérifié.
  const mfaToken = params.get("mfa_token");
  if (mfaToken) {
    store.set(COOKIES.mfa, mfaToken, cookieOptions(MAX_AGE.mfa));
    redirect(`/${lang}/login?step=mfa`);
  }

  const refreshToken = params.get("refresh_token");
  if (!refreshToken) redirect(`/${lang}/login?error=oauth`);

  const target = await applyTokens(
    {
      access_token: params.get("access_token") ?? "",
      refresh_token: refreshToken,
      mfa_required: false,
      needs_tenant_setup: params.get("onboarding") === "true",
      tenants: decodeTenants(params.get("tenants")),
    },
    lang,
  );
  redirect(target === "mfa" ? `/${lang}/login` : target);
}

function decodeTenants(encoded: string | null): TenantInfo[] | null {
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
