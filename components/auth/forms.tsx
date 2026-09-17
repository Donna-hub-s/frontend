"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { AuthErrorKey } from "@/lib/auth-rules";
import {
  createWorkspace,
  login,
  requestReset,
  resetPassword,
  selectWorkspace,
  signup,
  verifyMfa,
  type AuthState,
} from "@/lib/auth-actions";
import type { TenantInfo } from "@/lib/backend";
import { FormAlert, PasswordChecklist, PasswordField, SubmitButton, TextField } from "./fields";

type Auth = Dictionary["auth"];
type Base = { lang: Locale; auth: Auth };

const say = (auth: Auth, key?: AuthErrorKey) => (key ? auth.errors[key] : undefined);

export function Heading({ title, intro }: { title: string; intro: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-brand text-[2rem] leading-[2.375rem] font-light text-bordeaux-900 text-balance">{title}</h1>
      <p className="text-message text-ink-2 text-pretty">{intro}</p>
    </div>
  );
}

const footerLink = "font-medium";

/* ── Connexion (mot de passe puis, si activée, vérification en deux étapes) ───────── */

export function LoginForm({
  lang,
  auth,
  next,
  initialError,
  initialStep,
  oauth,
}: Base & { next?: string; initialError?: AuthErrorKey; initialStep?: "mfa"; oauth?: ReactNode }) {
  // initialStep « mfa » : retour de connexion Google sur un compte protégé (jeton MFA en cookie).
  const [state, action, pending] = useActionState(login, { error: initialError, step: initialStep });
  // Un « Recommencer » masque l'étape MFA de CETTE réponse ; une nouvelle soumission la rouvre.
  const [dismissed, setDismissed] = useState<AuthState | null>(null);

  if (state.step === "mfa" && dismissed !== state) {
    return <MfaStep lang={lang} auth={auth} next={next} onRestart={() => setDismissed(state)} />;
  }

  return (
    <div className="flex flex-col gap-7">
      <Heading title={auth.login.title} intro={auth.login.intro} />
      {oauth}
    <form action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="lang" value={lang} />
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && <FormAlert>{say(auth, state.error)}</FormAlert>}
      <TextField
        label={auth.fields.email}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.email}
        key={`email-${state.email ?? ""}`}
        error={say(auth, state.fields?.email)}
      />
      <PasswordField
        label={auth.fields.password}
        name="password"
        autoComplete="current-password"
        required
        showLabel={auth.fields.showPassword}
        hideLabel={auth.fields.hidePassword}
        error={say(auth, state.fields?.password)}
        aside={
          <Link href={`/${lang}/forgot-password`} className="text-secondary font-medium">
            {auth.login.forgot}
          </Link>
        }
      />
      <SubmitButton pending={pending} label={auth.login.submit} pendingLabel={auth.login.pending} />
      <p className="text-label text-ink-2">
        {auth.login.noAccount}{" "}
        <Link href={`/${lang}/signup`} className={footerLink}>
          {auth.login.signupLink}
        </Link>
      </p>
    </form>
    </div>
  );
}

function MfaStep({ lang, auth, next, onRestart }: Base & { next?: string; onRestart: () => void }) {
  const [state, action, pending] = useActionState(verifyMfa, {});
  const expired = state.error === "mfaExpired";

  return (
    <div className="flex flex-col gap-7">
      <Heading title={auth.mfa.title} intro={auth.mfa.intro} />
      <form action={action} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="lang" value={lang} />
        {next && <input type="hidden" name="next" value={next} />}
        {state.error && <FormAlert>{say(auth, state.error)}</FormAlert>}
        {!expired && (
          <>
            <TextField
              label={auth.fields.code}
              name="code"
              autoComplete="one-time-code"
              inputMode="text"
              autoFocus
              required
              maxLength={20}
              spellCheck={false}
              error={say(auth, state.fields?.code)}
            />
            <SubmitButton pending={pending} label={auth.mfa.submit} pendingLabel={auth.mfa.pending} />
          </>
        )}
      </form>
      <button type="button" onClick={onRestart} className="self-start text-label font-medium text-bordeaux-700 hover:text-bordeaux-900">
        {auth.mfa.restart}
      </button>
    </div>
  );
}

/* ── Inscription ───────────────────────────────────────────────────────────────── */

export function SignupForm({ lang, auth }: Base) {
  const [state, action, pending] = useActionState(signup, {});
  const [password, setPassword] = useState("");

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="lang" value={lang} />
      {state.error && <FormAlert>{say(auth, state.error)}</FormAlert>}
      <TextField
        label={auth.fields.email}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.email}
        key={`email-${state.email ?? ""}`}
        error={say(auth, state.fields?.email)}
      />
      <PasswordField
        label={auth.fields.password}
        name="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        showLabel={auth.fields.showPassword}
        hideLabel={auth.fields.hidePassword}
        error={say(auth, state.fields?.password)}
        hint={<PasswordChecklist password={password} title={auth.policy.title} labels={auth.policy} />}
      />
      <SubmitButton pending={pending} label={auth.signup.submit} pendingLabel={auth.signup.pending} />
      <p className="text-label text-ink-2">
        {auth.signup.hasAccount}{" "}
        <Link href={`/${lang}/login`} className={footerLink}>
          {auth.signup.loginLink}
        </Link>
      </p>
    </form>
  );
}

/* ── Mot de passe oublié / nouveau mot de passe ────────────────────────────────────── */

export function ForgotForm({ lang, auth }: Base) {
  const [state, action, pending] = useActionState(requestReset, {});

  return (
    <div className="flex flex-col gap-5">
      {state.done ? (
        <FormAlert tone="success">{auth.forgot.sent}</FormAlert>
      ) : (
        <form action={action} noValidate className="flex flex-col gap-5">
          {state.error && <FormAlert>{say(auth, state.error)}</FormAlert>}
          <TextField
            label={auth.fields.email}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.email}
            key={`email-${state.email ?? ""}`}
            error={say(auth, state.fields?.email)}
          />
          <SubmitButton pending={pending} label={auth.forgot.submit} pendingLabel={auth.forgot.pending} />
        </form>
      )}
      <Link href={`/${lang}/login`} className="self-start text-label font-medium">
        {auth.forgot.back}
      </Link>
    </div>
  );
}

export function ResetForm({ lang, auth, token }: Base & { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, {});
  const [password, setPassword] = useState("");

  if (state.done) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">{auth.reset.done}</FormAlert>
        <Link
          href={`/${lang}/login`}
          className="inline-flex h-11 items-center justify-center rounded-button bg-bordeaux-700 px-5 text-label font-medium text-white no-underline hover:bg-bordeaux-900 hover:text-white"
        >
          {auth.reset.loginLink}
        </Link>
      </div>
    );
  }

  const invalid = state.error === "resetInvalid";
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <FormAlert>
          {say(auth, state.error)}
          {invalid && (
            <>
              {" "}
              <Link href={`/${lang}/forgot-password`} className="font-medium text-danger underline hover:text-danger">
                {auth.reset.requestNew}
              </Link>
            </>
          )}
        </FormAlert>
      )}
      <PasswordField
        label={auth.fields.newPassword}
        name="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        showLabel={auth.fields.showPassword}
        hideLabel={auth.fields.hidePassword}
        error={say(auth, state.fields?.password)}
        hint={<PasswordChecklist password={password} title={auth.policy.title} labels={auth.policy} />}
      />
      <SubmitButton pending={pending} label={auth.reset.submit} pendingLabel={auth.reset.pending} />
    </form>
  );
}

/* ── Espace de travail : création ou choix ────────────────────────────────────────── */

export function WelcomeForm({ lang, auth }: Base) {
  const [state, action, pending] = useActionState(createWorkspace, {});

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="lang" value={lang} />
      {state.error && <FormAlert>{say(auth, state.error)}</FormAlert>}
      <TextField
        label={auth.fields.workspaceName}
        name="name"
        autoComplete="organization"
        autoFocus
        required
        maxLength={80}
        placeholder={auth.welcome.placeholder}
        error={say(auth, state.fields?.name)}
        hint={auth.welcome.hint}
      />
      <SubmitButton pending={pending} label={auth.welcome.submit} pendingLabel={auth.welcome.pending} />
    </form>
  );
}

export function WorkspacePicker({ lang, auth, tenants }: Base & { tenants: TenantInfo[] }) {
  const [state, action, pending] = useActionState(selectWorkspace, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lang" value={lang} />
      {state.error && <FormAlert>{say(auth, state.error)}</FormAlert>}
      <ul className="flex flex-col gap-2.5">
        {tenants.map((tenant) => {
          const name = tenant.name || auth.workspaces.unnamed;
          return (
            <li key={tenant.id}>
              <button
                type="submit"
                name="tenant"
                value={tenant.id}
                disabled={pending}
                className="group flex w-full items-center gap-3.5 rounded-card border border-border bg-white px-4 py-3.5 text-left transition-[border-color,box-shadow] duration-(--duration-fast) hover:border-bordeaux-700/40 hover:shadow-card disabled:cursor-progress disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-nav bg-peche-100 font-brand text-[1.125rem] text-bordeaux-900 uppercase"
                >
                  {name.charAt(0)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-message font-medium text-ink">{name}</span>
                  <span className="text-secondary text-ink-2">
                    {tenant.is_owner ? auth.workspaces.owner : auth.workspaces.member}
                  </span>
                </span>
                <span className="text-label font-medium text-bordeaux-700 group-hover:text-bordeaux-900">
                  {auth.workspaces.open}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
