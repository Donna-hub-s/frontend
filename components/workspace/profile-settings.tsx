"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import { locales, localeNames } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { ProfileOut } from "@/lib/workspace-types";
import { ArrowReturnIcon } from "./icons";

type Labels = Dictionary["workspace"]["settings"];

const fieldClass =
  "h-10 w-full rounded-button border border-border bg-white px-3 text-message text-ink placeholder:text-ink-3 focus:border-bordeaux-700 focus:shadow-focus focus:outline-none";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label font-medium text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

function Checkbox({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2.5 text-label text-ink">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-border text-bordeaux-700 focus:ring-bordeaux-700"
      />
      {label}
    </label>
  );
}

export function ProfileSettingsForm({ lang, labels, initialProfile }: { lang: Locale; labels: Labels; initialProfile: ProfileOut }) {
  const [displayName, setDisplayName] = useState(initialProfile.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatar_url ?? "");
  const [timezone, setTimezone] = useState(initialProfile.timezone);
  const [language, setLanguage] = useState(initialProfile.language ?? "");
  const [ttsVoice, setTtsVoice] = useState(initialProfile.preferred_tts_voice ?? "");
  const [defaultWebSearch, setDefaultWebSearch] = useState(initialProfile.default_force_web_search);
  const [notifyEmail, setNotifyEmail] = useState(initialProfile.notify_reminders_email);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(initialProfile.notify_reminders_whatsapp);
  const [whatsappNumber, setWhatsappNumber] = useState(initialProfile.whatsapp_notify_number ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "invalidTimezone">("idle");

  const ids = {
    displayName: useId(),
    avatarUrl: useId(),
    timezone: useId(),
    language: useId(),
    ttsVoice: useId(),
    webSearch: useId(),
    notifyEmail: useId(),
    notifyWhatsapp: useId(),
    whatsappNumber: useId(),
  };

  const save = async () => {
    setBusy(true);
    setStatus("idle");
    const response = await fetch("/api/donna/profile/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        timezone: timezone.trim() || "UTC",
        language: language || null,
        preferred_tts_voice: ttsVoice.trim() || null,
        default_force_web_search: defaultWebSearch,
        notify_reminders_email: notifyEmail,
        notify_reminders_whatsapp: notifyWhatsapp,
        whatsapp_notify_number: whatsappNumber.trim() || null,
      }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) setStatus("saved");
    else setStatus(response?.status === 400 ? "invalidTimezone" : "error");
  };

  return (
    <div className="scrollbar-none flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[38rem] flex-col gap-6 px-4 py-8 md:px-8">
        <Link href={`/${lang}/app`} className="inline-flex w-fit items-center gap-2 text-label font-medium text-ink-2 no-underline hover:text-bordeaux-900">
          <ArrowReturnIcon size={16} className="rotate-180" />
          {labels.back}
        </Link>

        <h1 className="text-hero-sm font-medium text-ink">{labels.title}</h1>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="flex flex-col gap-6"
        >
          <section className="flex flex-col gap-4 rounded-panel bg-surface p-5 shadow-card">
            <h2 className="text-panel-title font-medium text-ink">{labels.profileSection}</h2>
            <Field id={ids.displayName} label={labels.displayNameLabel}>
              <input id={ids.displayName} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} className={fieldClass} />
            </Field>
            <Field id={ids.avatarUrl} label={labels.avatarUrlLabel}>
              <input id={ids.avatarUrl} type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className={fieldClass} />
            </Field>
            <Field id={ids.timezone} label={labels.timezoneLabel}>
              <input id={ids.timezone} value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/Paris" className={fieldClass} />
            </Field>
            <Field id={ids.language} label={labels.languageLabel}>
              <select id={ids.language} value={language} onChange={(e) => setLanguage(e.target.value)} className={fieldClass}>
                <option value="">{labels.languageNone}</option>
                {locales.map((locale) => (
                  <option key={locale} value={locale}>
                    {localeNames[locale]}
                  </option>
                ))}
              </select>
              <p className="text-meta text-ink-3">{labels.languageHint}</p>
            </Field>
          </section>

          <section className="flex flex-col gap-4 rounded-panel bg-surface p-5 shadow-card">
            <h2 className="text-panel-title font-medium text-ink">{labels.chatPreferencesSection}</h2>
            <Field id={ids.ttsVoice} label={labels.ttsVoiceLabel}>
              <input id={ids.ttsVoice} value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} placeholder="fr_FR-siwis-medium" className={fieldClass} />
              <p className="text-meta text-ink-3">{labels.ttsVoiceHint}</p>
            </Field>
            <Checkbox id={ids.webSearch} label={labels.defaultWebSearchLabel} checked={defaultWebSearch} onChange={setDefaultWebSearch} />
          </section>

          <section className="flex flex-col gap-4 rounded-panel bg-surface p-5 shadow-card">
            <h2 className="text-panel-title font-medium text-ink">{labels.notificationsSection}</h2>
            <Checkbox id={ids.notifyEmail} label={labels.notifyEmailLabel} checked={notifyEmail} onChange={setNotifyEmail} />
            <Checkbox id={ids.notifyWhatsapp} label={labels.notifyWhatsappLabel} checked={notifyWhatsapp} onChange={setNotifyWhatsapp} />
            <Field id={ids.whatsappNumber} label={labels.whatsappNumberLabel}>
              <input id={ids.whatsappNumber} type="tel" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="+33612345678" className={fieldClass} />
            </Field>
          </section>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-button bg-bordeaux-700 px-4 py-2.5 text-label font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60"
            >
              {busy ? labels.saving : labels.save}
            </button>
            {status === "saved" && <span className="text-secondary text-success-ink">{labels.saved}</span>}
            {status === "error" && <span className="text-secondary text-danger">{labels.saveError}</span>}
            {status === "invalidTimezone" && <span className="text-secondary text-danger">{labels.invalidTimezone}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
