"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { ProviderIcon, type Provider } from "@/components/auth/oauth-buttons";
import type { Locale } from "@/i18n/config";
import { PROVIDER_NAMES } from "@/lib/oauth-feedback";
import { CheckIcon, KeyIcon, LaptopIcon, ShieldIcon } from "./icons";

type Labels = Dictionary["workspace"]["settings"];

const fieldClass =
  "h-10 w-full rounded-button border border-border bg-white px-3 text-message text-ink placeholder:text-ink-3 focus:border-bordeaux-700 focus:shadow-focus focus:outline-none";
const dangerButton = "rounded-button border border-danger/30 px-3 py-1.5 text-meta font-medium text-danger hover:bg-danger/[0.06] disabled:opacity-50";
const ghostSmall = "rounded-button border border-border px-3 py-1.5 text-meta font-medium text-ink hover:bg-active disabled:opacity-50";
const primarySmall = "rounded-button bg-bordeaux-700 px-3.5 py-1.5 text-meta font-medium text-white hover:bg-bordeaux-900 disabled:opacity-50";

/** Réponse de GET /app/auth/me (schemas/auth.py::UserResponse). */
type Me = { id: string; email: string; is_active: boolean; mfa_enabled: boolean; has_password: boolean };

type SessionOut = {
  id: string;
  tenant_id: string | null;
  ip_address: string | null;
  device_fingerprint: string | null;
  last_seen: string;
  expires_at: string;
  is_current: boolean;
};

type LinkedAccount = { provider: string; provider_email: string; provider_name: string | null; provider_avatar: string | null; linked_at: string };

const isKnownProvider = (value: string): value is Provider => Object.hasOwn(PROVIDER_NAMES, value);

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null; status: number }> {
  try {
    const response = await fetch(`/api/donna${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
    const data = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, data, status: response.status };
  } catch {
    return { ok: false, data: null, status: 0 };
  }
}

function Card({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-panel bg-surface shadow-card">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3.5">
        <span className="mt-0.5 text-ink-3">{icon}</span>
        <div>
          <h3 className="text-label font-medium text-ink">{title}</h3>
          <p className="mt-0.5 text-meta text-ink-3 text-pretty">{hint}</p>
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Onglet Sécurité : mot de passe, double authentification, sessions, comptes liés.
 * Chaque carte agit immédiatement (pas de brouillon commun) : ce sont des actions
 * sensibles, pas des préférences — on ne les groupe pas derrière un seul « Enregistrer ». */
export function SecurityPane({ lang, labels, oauthProviders }: { lang: Locale; labels: Labels; oauthProviders: string[] }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Me>("/auth/me").then(({ ok, data }) => {
      if (cancelled) return;
      if (ok && data) setMe(data);
      else setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadFailed) return <p className="py-10 text-center text-secondary text-danger">{labels.loadFailed}</p>;
  if (!me) return <p className="py-10 text-center text-secondary text-ink-3">{labels.loading}</p>;

  return (
    <div className="flex flex-col gap-6 pt-2 md:pt-0">
      <div>
        <h3 className="text-hero-sm font-medium text-ink">{labels.navSecurity}</h3>
        <p className="mt-1 text-secondary text-ink-3 text-pretty">{labels.securityHint}</p>
      </div>
      <PasswordCard labels={labels} hasPassword={me.has_password} onChanged={() => setMe((m) => (m ? { ...m, has_password: true } : m))} />
      <MfaCard labels={labels} enabled={me.mfa_enabled} onChanged={(enabled) => setMe((m) => (m ? { ...m, mfa_enabled: enabled } : m))} />
      <SessionsCard labels={labels} lang={lang} />
      <LinkedAccountsCard labels={labels} lang={lang} oauthProviders={oauthProviders} />
    </div>
  );
}

/* ── Mot de passe ───────────────────────────────────────────────────────────── */

function PasswordCard({ labels, hasPassword, onChanged }: { labels: Labels; hasPassword: boolean; onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) return setError(labels.passwordMismatch);
    setBusy(true);
    const { ok, data } = await api<{ detail?: string }>(hasPassword ? "/auth/password/change" : "/auth/password/set", {
      method: "POST",
      body: JSON.stringify(hasPassword ? { current_password: current, new_password: next } : { new_password: next }),
    });
    setBusy(false);
    if (ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
      onChanged();
    } else {
      setError(data?.detail || labels.loadFailed);
    }
  };

  return (
    <Card icon={<KeyIcon size={18} />} title={labels.passwordTitle} hint={hasPassword ? labels.passwordHint : labels.passwordSetHint}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {hasPassword && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={currentId} className="text-meta font-medium text-ink">
              {labels.currentPasswordLabel}
            </label>
            <input id={currentId} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={fieldClass} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nextId} className="text-meta font-medium text-ink">
            {labels.newPasswordLabel}
          </label>
          <input id={nextId} type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={confirmId} className="text-meta font-medium text-ink">
            {labels.confirmPasswordLabel}
          </label>
          <input id={confirmId} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={fieldClass} />
        </div>
        <div className="mt-1 flex items-center gap-3">
          <button type="submit" disabled={busy} className={primarySmall}>
            {busy ? labels.passwordChanging : hasPassword ? labels.passwordChangeAction : labels.passwordSetAction}
          </button>
          {done && <span className="text-meta text-success-ink">{labels.passwordChanged}</span>}
          {error && <span className="text-meta text-danger">{error}</span>}
        </div>
      </form>
    </Card>
  );
}

/* ── Double authentification ─────────────────────────────────────────────────── */

/** Génère une grille de modules à partir de qrcode-generator, sans lib de rendu :
 * un <rect> par module sombre, aucune dépendance canvas côté client. */
function TotpQr({ uri }: { uri: string }) {
  const [modules, setModules] = useState<boolean[][] | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode-generator").then(({ default: qrcode }) => {
      if (cancelled) return;
      const qr = qrcode(0, "M");
      qr.addData(uri);
      qr.make();
      const count = qr.getModuleCount();
      setModules(Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, col) => qr.isDark(row, col))));
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!modules) return <div className="size-40 shrink-0 animate-pulse rounded-card bg-active" />;
  const size = modules.length;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={160} height={160} className="shrink-0 rounded-card border border-border bg-white p-2" role="img" aria-label="QR code">
      {modules.map((row, r) => row.map((dark, c) => dark && <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="var(--color-ink)" />))}
    </svg>
  );
}

type Setup = { secret: string; provisioning_uri: string; backup_codes: string[] };

function MfaCard({ labels, enabled, onChanged }: { labels: Labels; enabled: boolean; onChanged: (enabled: boolean) => void }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [savedCodes, setSavedCodes] = useState(false);
  const [busy, setBusy] = useState<"start" | "confirm" | "disable" | "regen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [disableConfirm, setDisableConfirm] = useState(false);
  const codeId = useId();

  const start = async () => {
    setBusy("start");
    setError(null);
    const { ok, data } = await api<Setup>("/auth/mfa/setup", { method: "POST" });
    setBusy(null);
    if (ok && data) setSetup(data);
    else setError(labels.loadFailed);
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("confirm");
    setError(null);
    const { ok } = await api("/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code }) });
    setBusy(null);
    if (ok) {
      setSetup(null);
      setCode("");
      onChanged(true);
    } else {
      setError(labels.mfaInvalidCode);
    }
  };

  const disable = async () => {
    setBusy("disable");
    const { ok } = await api("/auth/mfa/", { method: "DELETE" });
    setBusy(null);
    setDisableConfirm(false);
    if (ok) onChanged(false);
    else setError(labels.loadFailed);
  };

  const regenerate = async () => {
    setBusy("regen");
    setError(null);
    const { ok, data } = await api<{ backup_codes: string[] }>("/auth/mfa/backup-codes/regenerate", { method: "POST" });
    setBusy(null);
    if (ok && data) setNewCodes(data.backup_codes);
    else setError(labels.loadFailed);
  };

  return (
    <Card icon={<ShieldIcon size={18} />} title={labels.mfaTitle} hint={labels.mfaHint}>
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 text-meta font-medium ${enabled ? "text-success-ink" : "text-ink-3"}`}>
          <span className={`size-1.5 rounded-full ${enabled ? "bg-success" : "bg-active"}`} />
          {enabled ? labels.mfaEnabledBadge : labels.mfaDisabledBadge}
        </span>
        {!enabled && !setup && (
          <button type="button" onClick={() => void start()} disabled={busy === "start"} className={primarySmall}>
            {labels.mfaEnable}
          </button>
        )}
        {enabled && !disableConfirm && (
          <button type="button" onClick={() => setDisableConfirm(true)} className={dangerButton}>
            {labels.mfaDisable}
          </button>
        )}
      </div>

      {enabled && disableConfirm && (
        <div className="mt-3 rounded-card bg-fill/60 p-3">
          <p className="text-secondary text-ink-2 text-pretty">{labels.mfaDisableConfirm}</p>
          <div className="mt-2.5 flex gap-2">
            <button type="button" onClick={() => setDisableConfirm(false)} className={ghostSmall}>
              {labels.cancel}
            </button>
            <button type="button" onClick={() => void disable()} disabled={busy === "disable"} className={dangerButton}>
              {busy === "disable" ? labels.mfaDisabling : labels.mfaDisable}
            </button>
          </div>
        </div>
      )}

      {enabled && !disableConfirm && (
        <div className="mt-3 border-t border-border pt-3">
          <button type="button" onClick={() => void regenerate()} disabled={busy === "regen"} className={ghostSmall}>
            {busy === "regen" ? labels.mfaRegenerating : labels.mfaRegenerateBackupCodes}
          </button>
          {newCodes && <BackupCodes labels={labels} codes={newCodes} regenerated />}
        </div>
      )}

      {setup && (
        <form onSubmit={confirm} className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-start gap-4">
            <TotpQr uri={setup.provisioning_uri} />
            <div className="min-w-0 flex-1">
              <p className="text-secondary text-ink-2 text-pretty">{labels.mfaScanHint}</p>
              <p className="mt-2 text-meta font-medium text-ink-3">{labels.mfaSecretLabel}</p>
              <p className="mt-0.5 rounded-badge bg-fill px-2 py-1 font-mono text-secondary break-all text-ink">{setup.secret}</p>
            </div>
          </div>
          <BackupCodes labels={labels} codes={setup.backup_codes} onAcknowledge={setSavedCodes} acknowledged={savedCodes} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={codeId} className="text-meta font-medium text-ink">
              {labels.mfaCodeLabel}
            </label>
            <input
              id={codeId}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={labels.mfaCodePlaceholder}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`max-w-[10rem] tracking-[0.3em] ${fieldClass}`}
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy === "confirm" || !savedCodes || code.length !== 6} className={primarySmall}>
              {busy === "confirm" ? labels.mfaConfirming : labels.mfaConfirmAction}
            </button>
            <button type="button" onClick={() => setSetup(null)} className={ghostSmall}>
              {labels.cancel}
            </button>
          </div>
        </form>
      )}
      {error && <p className="mt-3 text-meta text-danger">{error}</p>}
    </Card>
  );
}

function BackupCodes({
  labels,
  codes,
  onAcknowledge,
  acknowledged,
  regenerated,
}: {
  labels: Labels;
  codes: string[];
  onAcknowledge?: (value: boolean) => void;
  acknowledged?: boolean;
  regenerated?: boolean;
}) {
  const checkboxId = useId();
  return (
    <div className="rounded-card border border-border bg-fill/40 p-3">
      <p className="text-meta font-medium text-ink">{labels.mfaBackupCodesTitle}</p>
      <p className="mt-1 text-meta text-ink-3 text-pretty">{regenerated ? labels.mfaBackupCodesRegeneratedHint : labels.mfaBackupCodesHint}</p>
      <ul className="mt-2.5 grid grid-cols-2 gap-1.5 font-mono text-secondary text-ink sm:grid-cols-4">
        {codes.map((code) => (
          <li key={code} className="rounded-badge bg-white px-2 py-1 text-center">
            {code}
          </li>
        ))}
      </ul>
      {onAcknowledge && (
        <label htmlFor={checkboxId} className="mt-3 flex items-center gap-2 text-meta text-ink">
          <input id={checkboxId} type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledge(e.target.checked)} className="size-4 rounded border-border text-bordeaux-700 focus:ring-bordeaux-700" />
          {labels.mfaBackupCodesSavedLabel}
        </label>
      )}
    </div>
  );
}

/* ── Sessions ─────────────────────────────────────────────────────────────────── */

function SessionsCard({ labels, lang }: { labels: Labels; lang: Locale }) {
  const [sessions, setSessions] = useState<SessionOut[] | null>(null);
  const [busyId, setBusyId] = useState<string | "all" | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState(false);
  const format = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    api<SessionOut[]>("/auth/sessions").then(({ ok, data }) => setSessions(ok && data ? data : []));
  }, []);

  const revoke = async (id: string) => {
    setBusyId(id);
    setError(false);
    const { ok } = await api(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusyId(null);
    if (ok) setSessions((list) => list?.filter((s) => s.id !== id) ?? list);
    else setError(true);
  };

  const revokeOthers = async () => {
    if (!sessions) return;
    setBusyId("all");
    setError(false);
    const others = sessions.filter((s) => !s.is_current);
    const results = await Promise.all(others.map((s) => api(`/auth/sessions/${encodeURIComponent(s.id)}`, { method: "DELETE" })));
    setBusyId(null);
    setConfirmAll(false);
    if (results.some((r) => !r.ok)) setError(true);
    setSessions((list) => list?.filter((s) => s.is_current) ?? list);
  };

  const others = sessions?.filter((s) => !s.is_current) ?? [];

  return (
    <Card
      icon={<LaptopIcon size={18} />}
      title={labels.sessionsTitle}
      hint={labels.sessionsHint}
    >
      {!sessions ? (
        <p className="text-secondary text-ink-3">{labels.loading}</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border">
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                <span className="flex min-w-[10rem] flex-1 flex-col">
                  <span className="text-label text-ink">{session.device_fingerprint || labels.sessionUnknownDevice}</span>
                  <span className="text-meta text-ink-3">
                    {session.ip_address ? `${session.ip_address} — ` : ""}
                    {labels.sessionLastSeen.replace("{date}", format.format(new Date(session.last_seen)))}
                  </span>
                </span>
                {session.is_current ? (
                  <span className="rounded-badge bg-peche-100 px-2 py-1 text-meta font-medium text-bordeaux-900">{labels.sessionCurrentBadge}</span>
                ) : (
                  <button type="button" disabled={busyId === session.id} onClick={() => void revoke(session.id)} className={ghostSmall}>
                    {busyId === session.id ? labels.sessionRevoking : labels.sessionRevoke}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {others.length > 1 && (
            <div className="mt-3 border-t border-border pt-3">
              {!confirmAll ? (
                <button type="button" onClick={() => setConfirmAll(true)} className={ghostSmall}>
                  {labels.sessionRevokeAllOthers}
                </button>
              ) : (
                <div className="rounded-card bg-fill/60 p-3">
                  <p className="text-secondary text-ink-2 text-pretty">{labels.sessionRevokeAllConfirm}</p>
                  <div className="mt-2.5 flex gap-2">
                    <button type="button" onClick={() => setConfirmAll(false)} className={ghostSmall}>
                      {labels.cancel}
                    </button>
                    <button type="button" disabled={busyId === "all"} onClick={() => void revokeOthers()} className={dangerButton}>
                      {busyId === "all" ? labels.sessionRevoking : labels.sessionRevokeAllOthers}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {sessions.length === 0 && <p className="text-secondary text-ink-3">{labels.sessionsEmpty}</p>}
          {error && <p className="mt-2 text-meta text-danger">{labels.loadFailed}</p>}
        </>
      )}
    </Card>
  );
}

/* ── Comptes liés ─────────────────────────────────────────────────────────────── */

function LinkedAccountsCard({ labels, lang, oauthProviders }: { labels: Labels; lang: Locale; oauthProviders: string[] }) {
  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmProvider, setConfirmProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const format = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" });

  useEffect(() => {
    api<LinkedAccount[]>("/auth/oauth/me/accounts").then(({ ok, data }) => setAccounts(ok && data ? data : []));
  }, []);

  const unlink = async (provider: string) => {
    setBusy(provider);
    setError(null);
    const { ok, data } = await api<{ detail?: string }>(`/auth/oauth/${encodeURIComponent(provider)}/unlink`, { method: "DELETE" });
    setBusy(null);
    setConfirmProvider(null);
    if (ok) setAccounts((list) => list?.filter((a) => a.provider !== provider) ?? list);
    else setError(data?.detail || labels.loadFailed);
  };

  const linked = new Set((accounts ?? []).map((a) => a.provider));
  const connectable = oauthProviders.filter((p) => !linked.has(p));

  return (
    <Card icon={<CheckIcon size={18} />} title={labels.linkedAccountsTitle} hint={labels.linkedAccountsHint}>
      {!accounts ? (
        <p className="text-secondary text-ink-3">{labels.loading}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {accounts.map((account) => (
            <li key={account.provider} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-nav border border-border bg-white">
                {isKnownProvider(account.provider) && <ProviderIcon provider={account.provider} />}
              </span>
              <span className="flex min-w-[10rem] flex-1 flex-col">
                <span className="text-label text-ink">{PROVIDER_NAMES[account.provider] ?? account.provider}</span>
                <span className="truncate text-meta text-ink-3">{account.provider_email}</span>
              </span>
              {confirmProvider === account.provider ? (
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => setConfirmProvider(null)} className={ghostSmall}>
                    {labels.cancel}
                  </button>
                  <button type="button" disabled={busy === account.provider} onClick={() => void unlink(account.provider)} className={dangerButton}>
                    {labels.linkedAccountUnlink}
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmProvider(account.provider)} className={ghostSmall}>
                  {labels.linkedAccountUnlink}
                </button>
              )}
              {confirmProvider === account.provider && <p className="w-full text-meta text-ink-3 text-pretty">{labels.linkedAccountUnlinkConfirm}</p>}
              <span className="w-full text-meta text-ink-3">{labels.linkedSince.replace("{date}", format.format(new Date(account.linked_at)))}</span>
            </li>
          ))}
        </ul>
      )}
      {accounts && !accounts.length && <p className="text-secondary text-ink-3">{labels.linkedAccountsEmpty}</p>}
      {connectable.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {connectable.map((provider) => (
            <li key={provider}>
              <a
                href={`/oauth/${provider}?lang=${lang}&link=1`}
                className="inline-flex items-center gap-2 rounded-button border border-border bg-white px-3 py-1.5 text-meta font-medium text-ink no-underline hover:border-bordeaux-700/30"
              >
                {isKnownProvider(provider) && <ProviderIcon provider={provider} />}
                {labels.linkedAccountConnect} {PROVIDER_NAMES[provider] ?? provider}
              </a>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-meta text-danger">{error}</p>}
    </Card>
  );
}
