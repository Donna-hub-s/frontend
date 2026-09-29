"use client";

// Cartes de liens pour les URL citées par DONNA.
//
// Volontairement SANS appel réseau : afficher une carte « og:image » exigerait
// de récupérer la page depuis le serveur, donc une SSRF (le modèle contrôle
// l'URL : on pourrait viser 169.254.169.254, un localhost, ou un port interne).
// Une passerelle de ce type se construit avec une allowlist stricte, pas dans
// un composant React. Ici on se contente de ce que l'URL dit déjà : le
// domaine et le chemin — assez pour reconnaître d'où vient la source — et on
// laisse le lien s'ouvrir normalement.

import { GlobeIcon } from "./icons";

export type LinkCardData = { href: string; host: string; path: string };

/** URL http(s) dont on peut faire une carte. Les autres (mailto:, tel:,
 * liens internes /app/...) restent de simples liens. */
export function linkCardData(href: string | undefined): LinkCardData | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  const rest = `${url.pathname}${url.search}`.replace(/\/$/, "");
  // decodeURIComponent LEVE sur un '%' isolé (« /100% »), ce qui casserait le
  // rendu du message entier pour une URL parfaitement valide. On garde la
  // forme encodée dans ce cas.
  let path = rest;
  try {
    path = decodeURIComponent(rest);
  } catch {
    path = rest;
  }
  return { href: url.toString(), host, path };
}

/** Une carte pour un lien isolé (paragraphe ne contenant qu'un seul lien dont
 * le texte est l'URL elle-même) : c'est la forme que produit DONNA quand elle
 * cite une source. Un lien ancré dans une phrase garde le rendu inline. */
export function isBareUrlLink(href: string | undefined, text: string | undefined): boolean {
  if (!href || !text) return false;
  return text.trim() === href.trim();
}

export function LinkCard({ data }: { data: LinkCardData }) {
  return (
    <a
      href={data.href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="my-3 flex max-w-lg items-center gap-3 rounded-card border border-border bg-white p-3 no-underline transition-colors hover:border-ink-3/30 hover:bg-active/40"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-badge bg-active text-ink-3">
        <GlobeIcon size={18} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-label font-medium text-ink">{data.host}</span>
        <span className="truncate text-meta text-ink-3">{data.path || "/"}</span>
      </span>
    </a>
  );
}
