"use client";

// Cartes de liens pour les URL citées par DONNA ou tapées par l'utilisateur.
//
// La carte elle-même (domaine/chemin) ne fait AUCUN appel réseau : construite uniquement à
// partir de l'URL. L'APERÇU du contenu (titre + extrait), lui, passe par le backend
// (GET /app/chat/{id}/link-preview, voir lib/link-preview.ts), qui réutilise la même lecture
// sûre que l'outil fetch_page du modèle (backend/app/chat/src/webfetch.py) — résolution
// d'adresse publique, tailles/types/redirections bornés. Jamais déclenché par DONNA : un clic
// humain sur un lien déjà affiché, jamais renvoyé au modèle.

import { useEffect, useRef, useState } from "react";
import { fetchLinkPreview, type LinkPreview } from "@/lib/link-preview";
import { GlobeIcon } from "./icons";

export type LinkCardData = { href: string; host: string; path: string };
export type LinkCardLabels = { linkOpen: string; linkCancel: string; linkConfirmHint: string; linkPreviewError: string };

/** URL http(s) dont on peut faire une carte. Les autres (mailto:, tel:,
 * liens internes /app/...) restent de simples liens. */
export function linkCardData(href: string | undefined): LinkCardData | null {
  // Un espace brut dans une URL n'arrive jamais pour une vraie URL — c'est le signe que
  // `href` est en réalité une phrase (« https://x.dev est en panne ») : `new URL(...)`
  // est trop permissif et avalerait le reste de la phrase dans le chemin, encodé en %20.
  if (!href || /\s/.test(href)) return null;
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

function CardBody({ data }: { data: LinkCardData }) {
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-badge bg-active text-ink-3">
        <GlobeIcon size={18} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-label font-medium text-ink">{data.host}</span>
        <span className="truncate text-meta text-ink-3">{data.path || "/"}</span>
      </span>
    </>
  );
}

const cardClass =
  "flex w-full max-w-lg items-center gap-3 rounded-card border border-border bg-white p-3 no-underline transition-colors hover:border-ink-3/30 hover:bg-active/40";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: LinkPreview }
  | { status: "error"; message: string | null };

export function LinkCard({
  data,
  className = "my-3",
  confirm = false,
  preview = false,
  conversationId,
  labels,
}: {
  data: LinkCardData;
  className?: string;
  /** Un lien cité par DONNA s'ouvre après confirmation (popup + bouton « Ouvrir ») — un lien que
   * l'utilisateur tape lui-même dans son propre message n'a pas besoin de cette étape. */
  confirm?: boolean;
  /** Affiche un aperçu du contenu (titre + extrait) dans la popup — exige `conversationId`
   * (sert à vérifier que le lien est bien déjà visible dans CETTE conversation, voir le backend). */
  preview?: boolean;
  conversationId?: string;
  labels?: LinkCardLabels;
}) {
  const [open, setOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showPopover = confirm || preview;

  // Un seul aperçu par montant de la carte : rouvrir la popup après l'avoir fermée ne relance
  // pas la requête (previewState ne repasse jamais à "idle" tant que le composant vit).
  const openPopover = () => {
    setOpen(true);
    if (!preview || previewState.status !== "idle" || !conversationId) return;
    setPreviewState({ status: "loading" });
    void fetchLinkPreview(conversationId, data.href).then((result) => {
      setPreviewState(result.ok ? { status: "loaded", data: result.data } : { status: "error", message: result.message });
    });
  };

  if (!showPopover) {
    return (
      <a href={data.href} target="_blank" rel="noopener noreferrer nofollow" className={`${cardClass} ${className}`}>
        <CardBody data={data} />
      </a>
    );
  }

  return (
    <div ref={ref} className={`relative inline-block max-w-lg align-top ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPopover())}
        className={`${cardClass} text-left`}
      >
        <CardBody data={data} />
      </button>
      {open && (
        <div role="dialog" aria-label={data.host} className="absolute z-30 mt-1.5 w-80 rounded-panel border border-border bg-white p-3 shadow-float">
          {preview && (
            <div className="mb-2.5 border-b border-border pb-2.5">
              {previewState.status === "loading" && <p className="text-meta text-ink-3">…</p>}
              {previewState.status === "error" && (
                <p className="text-meta text-danger">{previewState.message ?? labels?.linkPreviewError}</p>
              )}
              {previewState.status === "loaded" && (
                <>
                  {previewState.data.title && <p className="text-label font-medium text-ink">{previewState.data.title}</p>}
                  {previewState.data.excerpt && <p className="mt-1 line-clamp-4 text-pretty text-meta text-ink-3">{previewState.data.excerpt}</p>}
                </>
              )}
            </div>
          )}
          <p className="truncate text-label font-medium text-ink">{data.host}</p>
          <p className="truncate text-meta text-ink-3">{data.path || "/"}</p>
          {confirm && labels && <p className="mt-2 text-meta text-ink-3">{labels.linkConfirmHint}</p>}
          <div className="mt-3 flex justify-end gap-2">
            {confirm && (
              <button type="button" onClick={() => setOpen(false)} className="rounded-button px-3 py-1.5 text-label text-ink-2 hover:bg-active">
                {labels?.linkCancel}
              </button>
            )}
            <a
              href={data.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={() => setOpen(false)}
              className={
                confirm
                  ? "rounded-button bg-bordeaux-700 px-3 py-1.5 text-label font-medium text-white no-underline hover:bg-bordeaux-900"
                  : "rounded-button px-3 py-1.5 text-label font-medium text-bordeaux-700 no-underline hover:bg-active"
              }
            >
              {labels?.linkOpen}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
