import type { Dictionary } from "@/app/[lang]/dictionaries";

// Règles de saisie partagées entre le navigateur (aide en direct) et les Server Actions (contrôle réel).

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Politique de mot de passe de xauth (services/auth.py::_check_password_policy). */
export const passwordRules = (password: string) => ({
  length: password.length >= 8,
  uppercase: /[A-Z]/.test(password),
  digit: /\d/.test(password),
});

export type PasswordRule = keyof ReturnType<typeof passwordRules>;

export const isStrongPassword = (password: string) => Object.values(passwordRules(password)).every(Boolean);

export type AuthErrorKey = keyof Dictionary["auth"]["errors"];

export const isAuthErrorKey = (value: unknown, errors: Dictionary["auth"]["errors"]): value is AuthErrorKey =>
  typeof value === "string" && Object.hasOwn(errors, value);
