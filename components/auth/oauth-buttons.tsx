import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { GoogleIcon } from "@/components/landing/hero";

export type Provider = keyof Dictionary["auth"]["providers"];

/** Réutilisée par settings-dialog.tsx (comptes liés) : mêmes icônes qu'à la connexion. */
export function ProviderIcon({ provider }: { provider: Provider }) {
  switch (provider) {
    case "google":
      return <GoogleIcon />;
    case "microsoft":
      return (
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden>
          <path fill="#F25022" d="M0 0h8.5v8.5H0z" />
          <path fill="#7FBA00" d="M9.5 0H18v8.5H9.5z" />
          <path fill="#00A4EF" d="M0 9.5h8.5V18H0z" />
          <path fill="#FFB900" d="M9.5 9.5H18V18H9.5z" />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden fill="#24292f">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
      );
    case "discord":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="#5865F2">
          <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.07 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.1c.36.7.77 1.37 1.23 2a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
        </svg>
      );
  }
}

export const isProvider = (value: string, dict: Dictionary): value is Provider => Object.hasOwn(dict.auth.providers, value);

/**
 * Un bouton par fournisseur réellement configuré côté backend (GET /app/auth/oauth/providers) :
 * aucun bouton factice si l'API ne répond pas ou si aucun fournisseur n'est actif.
 */
export function OAuthButtons({ providers, lang, dict }: { providers: string[]; lang: Locale; dict: Dictionary }) {
  const available = providers.filter((p) => isProvider(p, dict));
  if (!available.length) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        {available.map((provider) => (
          <a
            key={provider}
            href={`/oauth/${provider}?lang=${lang}`}
            className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-button border border-border bg-surface px-4 text-label font-medium text-ink no-underline transition-[border-color,background-color] duration-(--duration-fast) hover:border-ink-3/50 hover:bg-surface hover:text-ink"
          >
            <ProviderIcon provider={provider} />
            {dict.auth.providers[provider]}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-3 text-secondary text-ink-3">
        <span aria-hidden className="h-px flex-1 bg-border" />
        {dict.auth.or}
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
