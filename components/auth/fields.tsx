"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { passwordRules, type PasswordRule } from "@/lib/auth-rules";

const inputClass =
  "h-11 w-full rounded-button border bg-surface px-3.5 text-message text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-(--duration-fast) focus:border-bordeaux-700 focus:shadow-focus focus:outline-none disabled:opacity-60";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Élément aligné à droite du libellé (ex. « Mot de passe oublié ? »). */
  aside?: ReactNode;
};

/** Champ libellé : l'erreur est reliée au champ (aria-describedby) et annoncée. */
export function TextField({ label, error, hint, aside, id, ...input }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="text-label font-medium text-ink">
          {label}
        </label>
        {aside}
      </div>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
        className={`${inputClass} ${error ? "border-danger" : "border-border hover:border-ink-3/50"}`}
        {...input}
      />
      {error && (
        <p id={errorId} className="text-secondary text-danger">
          {error}
        </p>
      )}
      {hint && (
        <div id={hintId} className="text-secondary text-ink-2">
          {hint}
        </div>
      )}
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M1.8 10S4.8 4.2 10 4.2 18.2 10 18.2 10 15.2 15.8 10 15.8 1.8 10 1.8 10Z" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.6" />
      {!open && <path d="M3.5 16.5l13-13" />}
    </svg>
  );
}

type PasswordFieldProps = Omit<FieldProps, "type"> & { showLabel: string; hideLabel: string };

/** Mot de passe avec bouton afficher/masquer (le libellé du bouton suit l'état). */
export function PasswordField({ showLabel, hideLabel, label, error, hint, aside, id, ...input }: PasswordFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="text-label font-medium text-ink">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <input
          id={fieldId}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
          className={`${inputClass} pr-11 ${error ? "border-danger" : "border-border hover:border-ink-3/50"}`}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-badge text-ink-2 hover:text-bordeaux-900"
        >
          <EyeIcon open={!visible} />
        </button>
      </div>
      {error && (
        <p id={errorId} className="text-secondary text-danger">
          {error}
        </p>
      )}
      {hint && (
        <div id={hintId} className="text-secondary text-ink-2">
          {hint}
        </div>
      )}
    </div>
  );
}

/** Règles du mot de passe, cochées au fil de la saisie. */
export function PasswordChecklist({
  password,
  title,
  labels,
}: {
  password: string;
  title: string;
  labels: Record<PasswordRule, string>;
}) {
  const rules = passwordRules(password);
  return (
    <div>
      <p className="sr-only">{title}</p>
      <ul className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
        {(Object.keys(rules) as PasswordRule[]).map((rule) => (
          <li
            key={rule}
            className={`inline-flex items-center gap-1.5 transition-colors duration-(--duration-standard) ${
              rules[rule] ? "text-success-ink" : "text-ink-2"
            }`}
          >
            <span
              aria-hidden
              className={`inline-flex size-3.5 items-center justify-center rounded-full transition-colors duration-(--duration-standard) ${
                rules[rule] ? "bg-success" : "border border-ink-3/60"
              }`}
            >
              {rules[rule] && (
                <svg viewBox="0 0 12 12" width="10" height="10">
                  <path d="M3 6.2l1.9 1.9L9 4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            {labels[rule]}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FormAlert({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "success" }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex gap-2.5 rounded-card px-3.5 py-3 text-label ${
        tone === "danger" ? "bg-danger/[0.06] text-danger" : "bg-success-soft text-success-ink"
      }`}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden className="mt-px shrink-0">
        {tone === "danger" ? (
          <>
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 6v4.6M10 13.6v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="10" cy="10" r="8" fill="currentColor" />
            <path d="M6.2 10.2l2.6 2.6 5-5.2" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>
      <div className="text-pretty">{children}</div>
    </div>
  );
}

export function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-button bg-bordeaux-700 px-5 text-label font-medium text-white transition-colors duration-(--duration-fast) hover:bg-bordeaux-900 disabled:cursor-progress disabled:bg-bordeaux-900"
    >
      {pending && <span aria-hidden className="demo-spin size-4 rounded-full border-2 border-white/35 border-t-white" />}
      {pending ? pendingLabel : label}
    </button>
  );
}
