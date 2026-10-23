"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { AUTH_BASE, postJson, type TokenResponse } from "./backend";
import { applyTokens, clientIp, commonError, workspaceSlug } from "./auth-flow";
import { EMAIL_PATTERN, isStrongPassword, type AuthErrorKey } from "./auth-rules";
import { clearSession, readTenants } from "./session";
import { COOKIES } from "./session-cookies";

/** État renvoyé aux formulaires (useActionState). Les messages sont des clés du dictionnaire. */
export type AuthState = {
  error?: AuthErrorKey;
  fields?: Partial<Record<"email" | "password" | "code" | "name", AuthErrorKey>>;
  /** Valeur à remettre dans le champ email après une erreur (jamais le mot de passe). */
  email?: string;
  step?: "mfa";
  done?: boolean;
};

const localeOf = (formData: FormData): Locale => {
  const lang = formData.get("lang");
  return typeof lang === "string" && isLocale(lang) ? lang : defaultLocale;
};
const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const secret = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** Applique la réponse xauth : redirige, ou demande le code MFA. */
async function proceed(tokens: TokenResponse, lang: Locale, next?: unknown): Promise<AuthState> {
  const target = await applyTokens(tokens, lang, next);
  if (target === "mfa") return { step: "mfa" };
  redirect(target);
}

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const lang = localeOf(formData);
  const email = text(formData, "email");
  const password = secret(formData, "password");

  const fields: AuthState["fields"] = {};
  if (!EMAIL_PATTERN.test(email)) fields.email = email ? "invalidEmail" : "required";
  if (!password) fields.password = "required";
  if (Object.keys(fields).length) return { fields, email };

  // Identité de l'appareil déjà connue, s'il y en a une. Absente à la première connexion
  // depuis ce navigateur : le serveur en émet alors une, qu'applyTokens mémorise.
  const device = (await cookies()).get(COOKIES.device)?.value;
  const result = await postJson<TokenResponse>(
    `${AUTH_BASE}/login`,
    { email, password, ...(device ? { device_id: device } : {}) },
    await clientIp(),
  );
  if (!result.ok) {
    const inactive = result.detail.toLowerCase().includes("inactive");
    return { error: commonError(result) ?? (inactive ? "accountInactive" : "invalidCredentials"), email };
  }
  return proceed(result.data, lang, formData.get("next"));
}

export async function verifyMfa(_: AuthState, formData: FormData): Promise<AuthState> {
  const lang = localeOf(formData);
  const code = text(formData, "code").replace(/\s+/g, "");
  const store = await cookies();
  const mfaToken = store.get(COOKIES.mfa)?.value;
  if (!mfaToken) return { error: "mfaExpired" };
  if (!code) return { step: "mfa", fields: { code: "required" } };

  const result = await postJson<TokenResponse>(
    `${AUTH_BASE}/mfa/verify-login`,
    { mfa_token: mfaToken, code },
    await clientIp(),
  );
  if (!result.ok) {
    const common = commonError(result);
    if (common) return { step: "mfa", error: common };
    // « Code MFA invalide. » : nouvel essai possible. Sinon le jeton a expiré : on recommence.
    if (result.detail.toLowerCase().includes("code")) return { step: "mfa", fields: { code: "invalidCode" } };
    store.delete(COOKIES.mfa);
    return { error: "mfaExpired" };
  }
  return proceed(result.data, lang, formData.get("next"));
}

export async function signup(_: AuthState, formData: FormData): Promise<AuthState> {
  const lang = localeOf(formData);
  const email = text(formData, "email");
  const password = secret(formData, "password");

  const fields: AuthState["fields"] = {};
  if (!EMAIL_PATTERN.test(email)) fields.email = email ? "invalidEmail" : "required";
  if (!isStrongPassword(password)) fields.password = password ? "passwordPolicy" : "required";
  if (Object.keys(fields).length) return { fields, email };

  const ip = await clientIp();
  const created = await postJson(`${AUTH_BASE}/register`, { email, password }, ip);
  if (!created.ok) {
    const common = commonError(created);
    if (common) return { error: common, email };
    if (created.detail.toLowerCase().includes("already")) return { fields: { email: "emailTaken" }, email };
    if (created.status === 422) return { fields: { email: "invalidEmail" }, email };
    if (created.detail.toLowerCase().includes("password")) return { fields: { password: "passwordPolicy" }, email };
    return { error: "generic", email };
  }

  // Compte créé : connexion immédiate, puis création de l'espace (needs_tenant_setup).
  const session = await postJson<TokenResponse>(`${AUTH_BASE}/login`, { email, password }, ip);
  if (!session.ok) redirect(`/${lang}/login`);
  return proceed(session.data, lang);
}

export async function requestReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = text(formData, "email");
  if (!EMAIL_PATTERN.test(email)) return { fields: { email: email ? "invalidEmail" : "required" }, email };

  // xauth répond 202 que l'adresse existe ou non : l'écran ne révèle rien non plus.
  const result = await postJson(`${AUTH_BASE}/password/forgot`, { email }, await clientIp());
  if (!result.ok) {
    const common = commonError(result);
    if (common) return { error: common, email };
  }
  return { done: true, email };
}

export async function resetPassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const token = text(formData, "token");
  const password = secret(formData, "password");
  if (!token) return { error: "resetInvalid" };
  if (!isStrongPassword(password)) return { fields: { password: password ? "passwordPolicy" : "required" } };

  const result = await postJson(`${AUTH_BASE}/password/reset`, { token, new_password: password }, await clientIp());
  if (!result.ok) {
    const common = commonError(result);
    if (common) return { error: common };
    if (result.status === 422 || result.detail.toLowerCase().includes("password")) {
      return { fields: { password: "passwordPolicy" } };
    }
    return { error: "resetInvalid" };
  }
  return { done: true };
}

export async function createWorkspace(_: AuthState, formData: FormData): Promise<AuthState> {
  const lang = localeOf(formData);
  const name = text(formData, "name").slice(0, 80);
  if (!name) return { fields: { name: "required" } };

  const store = await cookies();
  const refreshToken = store.get(COOKIES.pending)?.value;
  if (!refreshToken) redirect(`/${lang}/login?error=sessionExpired`);

  const ip = await clientIp();
  // Le suffixe aléatoire rend une collision de slug improbable ; un second essai la couvre.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await postJson<TokenResponse>(
      `${AUTH_BASE}/setup/create`,
      { refresh_token: refreshToken, name, slug: workspaceSlug(name) },
      ip,
    );
    if (result.ok) return proceed(result.data, lang);
    const common = commonError(result);
    if (common) return { error: common };
    if (!result.detail.includes("slug")) redirect(`/${lang}/login?error=sessionExpired`);
  }
  return { error: "generic" };
}

export async function selectWorkspace(_: AuthState, formData: FormData): Promise<AuthState> {
  const lang = localeOf(formData);
  const tenantId = text(formData, "tenant");
  const store = await cookies();
  const refreshToken = store.get(COOKIES.pending)?.value;
  if (!refreshToken) redirect(`/${lang}/login?error=sessionExpired`);
  if (!readTenants(store).some((tenant) => tenant.id === tenantId)) return { error: "generic" };

  const result = await postJson<TokenResponse>(
    `${AUTH_BASE}/select-tenant`,
    { refresh_token: refreshToken, tenant_id: tenantId },
    await clientIp(),
  );
  if (!result.ok) {
    const common = commonError(result);
    if (common) return { error: common };
    redirect(`/${lang}/login?error=sessionExpired`);
  }
  return proceed(result.data, lang);
}

export async function logout(formData: FormData): Promise<void> {
  const lang = localeOf(formData);
  const store = await cookies();
  const refreshToken = store.get(COOKIES.refresh)?.value;
  // Révocation côté backend au mieux : la session locale est effacée dans tous les cas.
  if (refreshToken) await postJson(`${AUTH_BASE}/logout`, { refresh_token: refreshToken });
  clearSession(store);
  redirect(`/${lang}/login`);
}
