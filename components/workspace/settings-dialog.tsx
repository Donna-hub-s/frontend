"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { locales, localeNames, type Locale } from "@/i18n/config";
import type { ConnectorsOut, ProfileOut, SkillKey } from "@/lib/workspace-types";
import { SKILL_KEYS } from "@/lib/workspace-types";
import { Dialog } from "./dialog";
import { BellIcon, CloseIcon, PlugIcon, ShieldIcon, SlidersIcon, UserIcon } from "./icons";
import { SecurityPane } from "./security-pane";
import { ConnectorRows } from "./side-panel";
import { useWorkspace } from "./workspace-provider";

type WorkspaceDict = Dictionary["workspace"];
type Labels = WorkspaceDict["settings"];
type Tab = "profile" | "security" | "preferences" | "skills" | "notifications" | "connectors";
type Account = { name: string; email: string; initials: string; workspace: string | null };

/** Champs modifiables de GET/PATCH /app/profile/me. */
type Draft = {
  display_name: string;
  avatar_url: string;
  timezone: string;
  language: string;
  preferred_tts_voice: string;
  default_force_web_search: boolean;
  notify_reminders_email: boolean;
  notify_reminders_whatsapp: boolean;
  whatsapp_notify_number: string;
} & { [K in SkillKey]: boolean };

const toDraft = (p: ProfileOut): Draft => ({
  display_name: p.display_name ?? "",
  avatar_url: p.avatar_url ?? "",
  timezone: p.timezone || "UTC",
  language: p.language ?? "",
  preferred_tts_voice: p.preferred_tts_voice ?? "",
  default_force_web_search: p.default_force_web_search,
  notify_reminders_email: p.notify_reminders_email,
  notify_reminders_whatsapp: p.notify_reminders_whatsapp,
  whatsapp_notify_number: p.whatsapp_notify_number ?? "",
  enable_web_search: p.enable_web_search,
  enable_sub_agents: p.enable_sub_agents,
  enable_reminders: p.enable_reminders,
  enable_memory: p.enable_memory,
  enable_email_calendar: p.enable_email_calendar,
  enable_drive: p.enable_drive,
  enable_create_document: p.enable_create_document,
});

const fieldClass =
  "h-10 w-full rounded-button border border-border bg-white px-3 text-message text-ink placeholder:text-ink-3 focus:border-bordeaux-700 focus:shadow-focus focus:outline-none";

/** Paramètres du compte, en fenêtre : profil, préférences, notifications, connecteurs. */
export function SettingsDialog({
  lang,
  dict,
  account,
  connectors,
  oauthProviders,
}: {
  lang: Locale;
  dict: WorkspaceDict;
  account: Account;
  connectors: ConnectorsOut | null;
  oauthProviders: string[];
}) {
  const { settingsOpen, setSettingsOpen } = useWorkspace();

  // /app/settings redirige ici avec ?settings=1 : ouverture, puis adresse nettoyée.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("settings")) return;
    url.searchParams.delete("settings");
    window.history.replaceState(window.history.state, "", url);
    setSettingsOpen(true);
  }, [setSettingsOpen]);

  return (
    <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} label={dict.settings.title} className="flex h-[min(40rem,calc(100dvh-2rem))] max-w-[52rem] flex-col">
      <SettingsBody lang={lang} dict={dict} account={account} connectors={connectors} oauthProviders={oauthProviders} onClose={() => setSettingsOpen(false)} />
    </Dialog>
  );
}

function SettingsBody({
  lang,
  dict,
  account,
  connectors,
  oauthProviders,
  onClose,
}: {
  lang: Locale;
  dict: WorkspaceDict;
  account: Account;
  connectors: ConnectorsOut | null;
  oauthProviders: string[];
  onClose: () => void;
}) {
  const labels = dict.settings;
  const [tab, setTab] = useState<Tab>("profile");
  const [initial, setInitial] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "invalidTimezone">("idle");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/donna/profile/me", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<ProfileOut>) : Promise.reject()))
      .then((profile) => {
        if (cancelled) return;
        setInitial(toDraft(profile));
        setDraft(toDraft(profile));
      })
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => Boolean(draft && initial && JSON.stringify(draft) !== JSON.stringify(initial)), [draft, initial]);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setStatus("idle");
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setStatus("idle");
    const body: Record<string, unknown> = {
      display_name: draft.display_name.trim() || null,
      avatar_url: draft.avatar_url.trim() || null,
      timezone: draft.timezone.trim() || "UTC",
      language: draft.language || null,
      preferred_tts_voice: draft.preferred_tts_voice.trim() || null,
      default_force_web_search: draft.default_force_web_search,
      notify_reminders_email: draft.notify_reminders_email,
      notify_reminders_whatsapp: draft.notify_reminders_whatsapp,
      whatsapp_notify_number: draft.whatsapp_notify_number.trim() || null,
    };
    for (const key of SKILL_KEYS) body[key] = draft[key];
    const response = await fetch("/api/donna/profile/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      setInitial(draft);
      setStatus("saved");
    } else setStatus(response?.status === 400 || response?.status === 422 ? "invalidTimezone" : "error");
  };

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "profile", label: labels.navProfile, icon: <UserIcon size={17} /> },
    { key: "security", label: labels.navSecurity, icon: <ShieldIcon size={17} /> },
    { key: "preferences", label: labels.navPreferences, icon: <SlidersIcon size={17} /> },
    { key: "skills", label: labels.navSkills, icon: <SlidersIcon size={17} /> },
    { key: "notifications", label: labels.navNotifications, icon: <BellIcon size={17} /> },
    { key: "connectors", label: labels.navConnectors, icon: <PlugIcon size={17} /> },
  ];
  const displayName = draft?.display_name.trim() || account.name;

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <nav aria-label={labels.title} className="flex shrink-0 flex-col border-b border-border bg-surface md:w-[15rem] md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 md:px-5 md:pt-5">
          <h2 className="text-panel-title font-medium text-ink">{labels.title}</h2>
          <button type="button" onClick={onClose} aria-label={labels.close} className="-mr-1.5 rounded-button p-1.5 text-ink-3 hover:bg-active hover:text-ink md:hidden">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="hidden items-center gap-3 px-5 pt-5 pb-3 md:flex">
          <Avatar url={draft?.avatar_url} initials={account.initials} size="md" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-label font-medium text-ink">{displayName}</span>
            <span className="truncate text-meta text-ink-3">{account.email}</span>
          </span>
        </div>
        <ul role="tablist" aria-orientation="vertical" className="scrollbar-none flex gap-1 overflow-x-auto px-3 py-3 md:flex-col md:px-3">
          {tabs.map((item) => (
            <li key={item.key} role="presentation" className="shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={`flex w-full items-center gap-2.5 rounded-nav px-3 py-2 text-left text-label ${
                  tab === item.key ? "bg-white font-medium text-ink shadow-card" : "text-ink-2 hover:bg-active hover:text-ink"
                }`}
              >
                <span className={tab === item.key ? "text-bordeaux-700" : "text-ink-3"}>{item.icon}</span>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        <div className="hidden justify-end px-4 pt-3 md:flex">
          <button type="button" onClick={onClose} aria-label={labels.close} className="rounded-button p-1.5 text-ink-3 hover:bg-active hover:text-ink">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 pb-6 md:px-8">
          {tab === "connectors" ? (
            <Pane title={labels.navConnectors} hint={labels.connectorsHint}>
              <div className="overflow-hidden rounded-card border border-border">
                <ConnectorRows lang={lang} dict={dict} connectors={connectors} />
              </div>
            </Pane>
          ) : tab === "security" ? (
            <SecurityPane lang={lang} labels={labels} oauthProviders={oauthProviders} />
          ) : loadFailed ? (
            <p className="py-10 text-center text-secondary text-danger">{labels.loadError}</p>
          ) : !draft ? (
            <p className="py-10 text-center text-secondary text-ink-3">{labels.loading}</p>
          ) : tab === "profile" ? (
            <ProfilePane lang={lang} labels={labels} account={account} draft={draft} update={update} />
          ) : tab === "preferences" ? (
            <PreferencesPane labels={labels} draft={draft} update={update} />
          ) : tab === "skills" ? (
            <SkillsPane labels={labels} draft={draft} update={update} />
          ) : (
            <NotificationsPane labels={labels} account={account} draft={draft} update={update} />
          )}
        </div>

        {tab !== "connectors" && tab !== "security" && draft && (
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-3 md:px-8">
            <p aria-live="polite" className="mr-auto text-secondary">
              {status === "saved" && <span className="text-success-ink">{labels.saved}</span>}
              {status === "error" && <span className="text-danger">{labels.saveError}</span>}
              {status === "invalidTimezone" && <span className="text-danger">{labels.invalidTimezone}</span>}
              {status === "idle" && dirty && <span className="text-ink-3">{labels.unsaved}</span>}
            </p>
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => {
                setDraft(initial);
                setStatus("idle");
              }}
              className="rounded-button px-3.5 py-2 text-label font-medium text-ink hover:bg-active disabled:opacity-40"
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => void save()}
              className="rounded-button bg-bordeaux-700 px-4 py-2 text-label font-medium text-white hover:bg-bordeaux-900 disabled:opacity-50"
            >
              {busy ? labels.saving : labels.save}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

type PaneProps = { labels: Labels; draft: Draft; update: <K extends keyof Draft>(key: K, value: Draft[K]) => void };

function Pane({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 pt-2 md:pt-0">
      <div>
        <h3 className="text-hero-sm font-medium text-ink">{title}</h3>
        <p className="mt-1 text-secondary text-ink-3 text-pretty">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-meta text-ink-3 text-pretty">{hint}</p>}
    </div>
  );
}

/** Interrupteur accessible (role="switch") avec libellé et explication. */
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="text-label font-medium text-ink">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-meta text-ink-3 text-pretty">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-bordeaux-700" : "bg-active"}`}
      >
        <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-card transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );
}

function Avatar({ url, initials, size }: { url?: string; initials: string; size: "md" | "lg" }) {
  const [broken, setBroken] = useState<string | null>(null);
  const valid = url && /^https:\/\//i.test(url) && broken !== url;
  const box = size === "lg" ? "size-16 text-panel-title" : "size-10 text-label";
  return valid ? (
    // eslint-disable-next-line @next/next/no-img-element -- URL externe choisie par l'utilisateur
    <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(url)} className={`${box} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${box} flex shrink-0 items-center justify-center rounded-full bg-peche-100 font-medium text-bordeaux-900`}>{initials}</span>
  );
}

function ProfilePane({ lang, labels, account, draft, update }: PaneProps & { lang: Locale; account: Account }) {
  const zones = useMemo(() => {
    const list = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return list.includes(draft.timezone) ? list : [draft.timezone, ...list];
  }, [draft.timezone]);
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", timeZone: zones.includes(draft.timezone) ? draft.timezone : "UTC" });

  return (
    <Pane title={labels.navProfile} hint={labels.profileHint}>
      <div className="flex items-center gap-4">
        <Avatar url={draft.avatar_url} initials={account.initials} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-message font-medium text-ink">{draft.display_name.trim() || account.name}</p>
          <p className="truncate text-secondary text-ink-3">{account.email}</p>
          {account.workspace && <p className="truncate text-meta text-ink-3">{account.workspace}</p>}
        </div>
      </div>

      <Field label={labels.displayNameLabel} hint={labels.displayNameHint}>
        {(id) => <input id={id} value={draft.display_name} onChange={(e) => update("display_name", e.target.value)} maxLength={120} placeholder={account.name} className={fieldClass} />}
      </Field>
      <Field label={labels.avatarUrlLabel} hint={labels.avatarHint}>
        {(id) => <input id={id} type="url" inputMode="url" value={draft.avatar_url} onChange={(e) => update("avatar_url", e.target.value)} placeholder="https://" className={fieldClass} />}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={labels.timezoneLabel} hint={labels.timezoneNow.replace("{time}", now.format(new Date()))}>
          {(id) => (
            <div className="flex flex-col gap-1.5">
              <select id={id} value={draft.timezone} onChange={(e) => update("timezone", e.target.value)} className={fieldClass}>
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              {deviceZone && deviceZone !== draft.timezone && (
                <button type="button" onClick={() => update("timezone", deviceZone)} className="w-fit text-meta font-medium text-bordeaux-700 hover:text-bordeaux-900">
                  {labels.timezoneDevice.replace("{zone}", deviceZone.replaceAll("_", " "))}
                </button>
              )}
            </div>
          )}
        </Field>
        <Field label={labels.languageLabel} hint={labels.languageHint}>
          {(id) => (
            <select id={id} value={draft.language} onChange={(e) => update("language", e.target.value)} className={fieldClass}>
              <option value="">{labels.languageNone}</option>
              {locales.map((locale) => (
                <option key={locale} value={locale}>
                  {localeNames[locale]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
    </Pane>
  );
}

function PreferencesPane({ labels, draft, update }: PaneProps) {
  return (
    <Pane title={labels.navPreferences} hint={labels.preferencesHint}>
      <Toggle
        label={labels.defaultWebSearchLabel}
        hint={labels.defaultWebSearchHint}
        checked={draft.default_force_web_search}
        onChange={(value) => update("default_force_web_search", value)}
      />
      <div className="border-t border-border" />
      <Field label={labels.ttsVoiceLabel} hint={labels.ttsVoiceHint}>
        {(id) => (
          <input id={id} value={draft.preferred_tts_voice} onChange={(e) => update("preferred_tts_voice", e.target.value)} placeholder="fr_FR-siwis-medium" className={fieldClass} />
        )}
      </Field>
    </Pane>
  );
}

function SkillsPane({ labels, draft, update }: PaneProps) {
  return (
    <Pane title={labels.navSkills} hint={labels.skillsHint}>
      {SKILL_KEYS.map((key, index) => {
        const copy = labels.skill[key];
        return (
          <div key={key} className={index > 0 ? "border-t border-border" : undefined}>
            <Toggle
              label={copy.label}
              hint={copy.description}
              checked={draft[key]}
              onChange={(value) => update(key, value)}
            />
          </div>
        );
      })}
    </Pane>
  );
}

function NotificationsPane({ labels, account, draft, update }: PaneProps & { account: Account }) {
  return (
    <Pane title={labels.navNotifications} hint={labels.notificationsHint}>
      <Toggle
        label={labels.notifyEmailLabel}
        hint={labels.notifyEmailHint.replace("{email}", account.email)}
        checked={draft.notify_reminders_email}
        onChange={(value) => update("notify_reminders_email", value)}
      />
      <div className="border-t border-border" />
      <Toggle
        label={labels.notifyWhatsappLabel}
        hint={labels.notifyWhatsappHint}
        checked={draft.notify_reminders_whatsapp}
        onChange={(value) => update("notify_reminders_whatsapp", value)}
      />
      {draft.notify_reminders_whatsapp && (
        <Field label={labels.whatsappNumberLabel}>
          {(id) => (
            <input
              id={id}
              type="tel"
              inputMode="tel"
              value={draft.whatsapp_notify_number}
              onChange={(e) => update("whatsapp_notify_number", e.target.value)}
              placeholder="+226 70 00 00 00"
              className={`${fieldClass} max-w-[18rem]`}
            />
          )}
        </Field>
      )}
    </Pane>
  );
}
