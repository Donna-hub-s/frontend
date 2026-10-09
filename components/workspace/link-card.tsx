"use client";

// Cartes de liens pour les URL citées par DONNA ou tapées par l'utilisateur.
//
// La carte elle-même (domaine/chemin) ne fait AUCUN appel réseau : construite uniquement à
// partir de l'URL. L'APERÇU du contenu (titre + extrait), lui, passe par le backend
// (GET /app/chat/{id}/link-preview, voir lib/link-preview.ts), qui réutilise la même lecture
// sûre que l'outil fetch_page du modèle (backend/app/chat/src/webfetch.py) — résolution
// d'adresse publique, tailles/types/redirections bornés. Jamais déclenché par DONNA : un clic
// humain sur un lien déjà affiché, jamais renvoyé au modèle.
//
// Même fenêtre d'aperçu pour un lien DANS une phrase ou une liste (InlineLink) : un clic simple ouvre l'aperçu (titre,
// extrait) avec un bouton « Ouvrir » ; un clic avec Ctrl/Cmd/Maj ou du milieu ouvre la page comme un lien normal.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { fetchLinkPreview, type LinkPreview } from "@/lib/link-preview";
import { isPlainClick } from "@/lib/link-click";
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
  "flex w-full max-w-lg items-center gap-3 rounded-card border border-border bg-surface p-3 no-underline transition-colors hover:border-ink-3/30 hover:bg-active/40";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: LinkPreview }
  | { status: "error"; message: string | null };

/** État de la fenêtre d'un lien : ouverture/fermeture (clic extérieur, Échap) et aperçu chargé AU CLIC seulement. */
function useLinkPopover(containerRef: RefObject<HTMLElement | null>, data: LinkCardData, preview: boolean, conversationId?: string) {
  const [open, setOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => !containerRef.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, containerRef]);

  // Un seul aperçu par montant du lien : rouvrir la fenêtre après l'avoir fermée ne relance
  // pas la requête (previewState ne repasse jamais à "idle" tant que le composant vit).
  const openPopover = () => {
    setOpen(true);
    if (!preview || previewState.status !== "idle" || !conversationId) return;
    setPreviewState({ status: "loading" });
    void fetchLinkPreview(conversationId, data.href).then((result) => {
      setPreviewState(result.ok ? { status: "loaded", data: result.data } : { status: "error", message: result.message });
    });
  };

  return { open, setOpen, previewState, openPopover, toggle: () => (open ? setOpen(false) : openPopover()) };
}

/** La fenêtre elle-même. Uniquement des <span> : elle peut se trouver DANS un paragraphe (lien d'une phrase), où un <div> ou
 * un <p> serait un HTML invalide. */
function PopoverPanel({
  data,
  preview,
  confirm,
  previewState,
  labels,
  onClose,
  position,
}: {
  data: LinkCardData;
  preview: boolean;
  confirm: boolean;
  previewState: PreviewState;
  labels?: LinkCardLabels;
  onClose: () => void;
  position: string;
}) {
  return (
    <span
      role="dialog"
      aria-label={data.host}
      className={`absolute z-30 block w-80 max-w-[min(20rem,calc(100vw-2rem))] rounded-panel border border-border bg-surface p-3 text-left font-normal shadow-float ${position}`}
    >
      {preview && (
        <span className="mb-2.5 block border-b border-border pb-2.5">
          {previewState.status === "loading" && <span className="block text-meta text-ink-3">…</span>}
          {previewState.status === "error" && (
            <span className="block text-meta text-danger">{previewState.message ?? labels?.linkPreviewError}</span>
          )}
          {previewState.status === "loaded" && (
            <>
              {previewState.data.title && <span className="block text-label font-medium text-ink">{previewState.data.title}</span>}
              {previewState.data.excerpt && (
                <span className="mt-1 line-clamp-4 block text-pretty text-meta text-ink-3">{previewState.data.excerpt}</span>
              )}
            </>
          )}
        </span>
      )}
      <span className="block truncate text-label font-medium text-ink">{data.host}</span>
      <span className="block truncate text-meta text-ink-3">{data.path || "/"}</span>
      {confirm && labels && <span className="mt-2 block text-meta text-ink-3">{labels.linkConfirmHint}</span>}
      <span className="mt-3 flex justify-end gap-2">
        {confirm && (
          <button type="button" onClick={onClose} className="rounded-button px-3 py-1.5 text-label text-ink-2 hover:bg-active">
            {labels?.linkCancel}
          </button>
        )}
        <a
          href={data.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={onClose}
          className={
            confirm
              ? "rounded-button bg-brand-fill px-3 py-1.5 text-label font-medium text-white no-underline hover:bg-brand-fill-strong"
              : "rounded-button px-3 py-1.5 text-label font-medium text-brand no-underline hover:bg-active"
          }
        >
          {labels?.linkOpen}
        </a>
      </span>
    </span>
  );
}

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
  const ref = useRef<HTMLDivElement>(null);
  const popover = useLinkPopover(ref, data, preview, conversationId);

  if (!(confirm || preview)) {
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
        aria-expanded={popover.open}
        onClick={popover.toggle}
        className={`${cardClass} text-left`}
      >
        <CardBody data={data} />
      </button>
      {popover.open && (
        <PopoverPanel
          data={data}
          preview={preview}
          confirm={confirm}
          previewState={popover.previewState}
          labels={labels}
          onClose={() => popover.setOpen(false)}
          position="mt-1.5"
        />
      )}
    </div>
  );
}

/** Un lien d'une phrase ou d'une liste : le texte reste dans la ligne, un clic simple ouvre l'aperçu (chargé à ce moment-là,
 * jamais avant), un clic avec Ctrl/Cmd/Maj/Alt ou du milieu ouvre la page comme un lien ordinaire. */
export function InlineLink({
  data,
  label,
  className,
  conversationId,
  labels,
}: {
  data: LinkCardData;
  label: ReactNode;
  className?: string;
  conversationId: string;
  labels?: LinkCardLabels;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const popover = useLinkPopover(ref, data, true, conversationId);
  return (
    <span ref={ref} className="relative">
      <a
        href={data.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={className}
        aria-haspopup="dialog"
        aria-expanded={popover.open}
        onClick={(event) => {
          if (!isPlainClick(event)) return;
          event.preventDefault();
          popover.toggle();
        }}
      >
        {label}
      </a>
      {popover.open && (
        <PopoverPanel
          data={data}
          preview
          confirm
          previewState={popover.previewState}
          labels={labels}
          onClose={() => popover.setOpen(false)}
          position="left-0 top-full mt-1"
        />
      )}
    </span>
  );
}
