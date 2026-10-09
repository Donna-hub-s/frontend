"use client";

// Aperçu d'une conversation au survol d'une ligne de la barre latérale.
//
// Volontairement dans un portail en `position: fixed` : la barre latérale
// défile (`overflow-y: auto`), ce qui fait calculer `overflow-x` à `auto`
// également — une carte ancrée en `left: 100%` de la ligne serait rognée.
// On mesure donc la ligne au survol et on repositionne sur `resize`/`scroll`.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MessageOut } from "@/lib/api";
import { parseBackendDate } from "@/lib/workspace-types";

/** Délai avant d'ouvrir : évite de déclencher un aller-retour réseau quand on
 * traverse simplement la barre latérale du curseur. */
const OPEN_DELAY = 350;
const CARD_WIDTH = 336;
const CARD_GAP = 8;
/** Nombre de messages montrés, du plus récent au plus ancien. */
const VISIBLE = 3;

export type PreviewAnchor = { id: string; top: number; right: number; height: number };

/** Cache mémoire des aperçus déjà chargés : survoler deux fois la même
 * conversation ne refait pas l'appel. Borné pour ne pas grossir la session. */
const cache = new Map<string, MessageOut[]>();
const CACHE_MAX = 40;

export function ConversationHoverPreview({
  anchor,
  labels,
}: {
  anchor: PreviewAnchor;
  labels: { loading: string; empty: string; you: string; donna: string };
}) {
  const [messages, setMessages] = useState<MessageOut[] | null>(() => cache.get(anchor.id) ?? null);
  const [loadedId, setLoadedId] = useState(anchor.id);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchor.top, left: 0 });

  // Le survol peut passer d'une conversation à l'autre sans refermer la carte.
  // On ajuste donc pendant le rendu (motif documenté par React) plutôt que dans
  // un effet, ce qui éviterait un rendu en cascade.
  if (loadedId !== anchor.id) {
    setLoadedId(anchor.id);
    setMessages(cache.get(anchor.id) ?? null);
  }

  // `messages === null` = pas encore chargé (cache vide) → on va le chercher.
  const pending = messages === null;
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    void fetch(`/api/donna/chat/${encodeURIComponent(anchor.id)}/messages`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<MessageOut[]>) : []))
      .then((list) => {
        if (cancelled) return;
        const recent = (list ?? []).slice(-VISIBLE);
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
        cache.set(anchor.id, recent);
        setMessages(recent);
      })
      .catch(() => !cancelled && setMessages([]));
    return () => {
      cancelled = true;
    };
  }, [anchor.id, pending]);

  // Recalcule la position à chaque défilement/redimensionnement : la ligne
  // bouge sous le curseur pendant que la carte est ouverte.
  useEffect(() => {
    const place = () => {
      const height = ref.current?.offsetHeight ?? 160;
      const viewportH = window.innerHeight;
      // Centrée sur la ligne, puis ramenée dans la fenêtre si elle déborde.
      let top = anchor.top - (height - anchor.height) / 2;
      top = Math.min(Math.max(8, top), Math.max(8, viewportH - height - 8));
      setPos({ top, left: Math.min(anchor.right + CARD_GAP, window.innerWidth - CARD_WIDTH - 8) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor.top, anchor.right, anchor.height]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      // Contenu strictement redondant (la conversation est déjà ouvrable) :
      // masqué aux lecteurs d'écran plutôt que exposé comme un tooltip orphelin.
      aria-hidden="true"
      // pointer-events: none : rien n'y est cliquable, et surtout le curseur
      // peut traverser la carte sans déclencher la fermeture (sinon clignotement).
      style={{ top: pos.top, left: pos.left, width: CARD_WIDTH }}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-panel border border-border bg-surface shadow-float"
    >
      {messages === null ? (
        <p className="px-3.5 py-3 text-meta text-ink-3">{labels.loading}</p>
      ) : messages.length === 0 ? (
        <p className="px-3.5 py-3 text-meta text-ink-3">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2.5 px-3.5 py-3">
          {[...messages].reverse().map((message, index) => {
            const at = parseBackendDate(message.created_at);
            return (
              <li key={`${message.created_at}-${index}`} className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-meta text-ink-3">
                  <span className={message.role === "user" ? "font-medium text-ink-2" : "font-medium text-brand"}>
                    {message.role === "user" ? labels.you : labels.donna}
                  </span>
                  {at && <span>· {new Date(at).toLocaleDateString()}</span>}
                </span>
                <span className="line-clamp-3 text-label text-ink-2">{message.content}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>,
    document.body,
  );
}

/** Minuteur d'ouverture : renvoie le handler à poser sur la ligne.
 * Fermeture immédiate au sortir — la carte est `pointer-events: none`, donc
 * il n'y a rien à garder ouverte et pas de clignotement à prévoir. */
export function useHoverPreview(onOpen: (anchor: PreviewAnchor) => void, onClose: () => void) {
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => clear, []);

  return {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      clear();
      const id = event.currentTarget.dataset.conversationId;
      if (!id) return;
      // Relevé synchrone : `event.currentTarget` n'est pas garanti lisible
      // depuis le callback du minuteur, et le DOM peut avoir bougé entre-temps.
      const rect = event.currentTarget.getBoundingClientRect();
      const anchor = { id, top: rect.top, right: rect.right, height: rect.height };
      timer.current = window.setTimeout(() => onOpen(anchor), OPEN_DELAY);
    },
    onMouseLeave: () => {
      clear();
      onClose();
    },
  };
}
