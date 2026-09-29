"use client";

// Collage en bas du fil de discussion, robuste aux sauts de mise en page.
//
// Pourquoi un hook plutôt que le `el.scrollTop = el.scrollHeight` d'avant :
// pendant la rédaction, la hauteur du contenu change souvent SANS que
// `messages` change — une image qui se charge, un bloc markdown, un carte de
// source dépliée. Le collage ne se déclenchait qu'au rendu du message suivant,
// ce qui laissait le fil dérillé quelques pixels au-dessus du bas (le dernier
// mot coupé). Un ResizeObserver sur le conteneur de contenu rattrape ces
// changements de hauteur, y compris ceux qui arrivent après coup.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Distance en px sous laquelle on considère que l'utilisateur est « en bas ». */
const STICK_THRESHOLD = 80;

export type StickToBottom = {
  /** Ref sur l'élément défilant (la zone scrollable). */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Ref sur l'élément dont la hauteur pilote le collage (contenu). */
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** Vrai quand de nouveaux tokens arrivent alors que l'utilisateur a remonté. */
  pending: boolean;
  /** Repart en bas et désarme l'indicateur. */
  toBottom: (behavior?: ScrollBehavior) => void;
  /** À appeler à chaque défilement de l'utilisateur. */
  onScroll: () => void;
  /** Force le collage (nouveau message envoyé) et repart en bas. */
  stick: () => void;
};

export function useStickToBottom(resetKey: string | null): StickToBottom {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  // Vrai tant que l'utilisateur n'a pas scrollé lui-même depuis le dernier
  // collage automatique : distingue « il a remonté » de « ça dérive ».
  const userScrolled = useRef(false);
  // `pending` est porté par resetKey : le remettre à zéro AU RENDU (et non
  // dans un effet) évite le setState synchrone en effet que le lint React
  // interdit, et dispense d'un rendu en cascade au changement de conversation.
  const [state, setState] = useState({ key: resetKey, pending: false });
  if (state.key !== resetKey) setState({ key: resetKey, pending: false });
  const pending = state.key === resetKey && state.pending;

  const toBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stuck.current = true;
    userScrolled.current = false;
    setState((s) => (s.pending ? { ...s, pending: false } : s));
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
    stuck.current = atBottom;
    // Une remontée volontaire de l'utilisateur est le seul cas où
    // l'indicateur « nouveau message » doit s'armer ; un collage automatique,
    // lui, ne l'arme jamais.
    if (atBottom) {
      userScrolled.current = false;
      setState((s) => (s.pending ? { ...s, pending: false } : s));
    } else if (userScrolled.current) {
      setState((s) => (s.pending ? s : { ...s, pending: true }));
    } else {
      userScrolled.current = true;
    }
  }, []);

  const stick = useCallback(() => {
    stuck.current = true;
    userScrolled.current = false;
    setState((s) => (s.pending ? { ...s, pending: false } : s));
  }, []);

  // Colle après chaque rendu du fil.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  });

  // Colle aussi quand la HAUTEUR du contenu change sans rendu de message
  // (image chargée, carte dépliée, fonte web) : sans ça, le fil reste
  // quelques pixels au-dessus du bas.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (stuck.current) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      // L'utilisateur a remonté et le contenu grandit : c'est ici — et
      // seulement ici — qu'il faut armer l'indicateur « nouveau message ».
      // Armé depuis `onScroll`, il n'apparaîtrait jamais : la remontée ne
      // déclenche qu'un seul événement, et la croissance du contenu n'en
      // produit aucun.
      setState((s) => (s.pending ? s : { ...s, pending: true }));
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Changement de conversation : on repart systématiquement en bas, même si
  // l'utilisateur avait remonté la conversation précédente. `pending` est
  // déjà remis à zéro ci-dessus, pendant le rendu.
  useLayoutEffect(() => {
    stuck.current = true;
    userScrolled.current = false;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [resetKey]);

  return { scrollRef, contentRef, pending, toBottom, onScroll, stick };
}
