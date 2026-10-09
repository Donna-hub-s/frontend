"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { DonnaMark } from "@/components/brand/donna-mark";
import { DonnaOrb } from "@/components/brand/donna-orb";
import type { Dictionary } from "@/app/[lang]/dictionaries";

type Demo = Dictionary["demo"];

/*
 * Démo scénarisée du hero. Phases :
 * 0 accueil + saisie · 1 message envoyé · 2 réflexion · 3-5 étapes · 6 brouillon
 * 7 le curseur rejoint « Envoyer » · 8 clic · 9 envoyé · 10 fondu de fin de boucle.
 * La zone de conversation a une hauteur fixe : rien ne saute pendant la séquence.
 */
const TYPE_MS = 30;
const PHASES: [phase: number, holdMs: number][] = [
  [1, 500],
  [2, 550],
  [3, 900],
  [4, 950],
  [5, 950],
  [6, 950],
  [7, 1700],
  [8, 900],
  [9, 260],
  [10, 2600],
];
const FADE_MS = 600;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const usePrefersReducedMotion = () =>
  useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED_QUERY).matches, () => false);

function StepIcon({ done }: { done: boolean }) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <span
        className={`demo-spin absolute inset-0 rounded-full border-2 border-pending border-t-brand transition-opacity duration-200 ${
          done ? "opacity-0" : "opacity-100"
        }`}
      />
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        aria-hidden
        className={`absolute inset-0 text-success transition-[opacity,transform] duration-300 ease-(--ease-enter) ${
          done ? "scale-100 opacity-100" : "scale-50 opacity-0"
        }`}
      >
        <circle cx="8" cy="8" r="8" fill="currentColor" />
        <path d="M4.5 8.2l2.3 2.3 4.7-4.8" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function HeroDemo({ demo }: { demo: Demo }) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(true);
  const [chars, setChars] = useState(0);
  const [phase, setPhase] = useState(0);
  const [cycle, setCycle] = useState(0);
  const cursorRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !visible) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    const at = (delay: number, fn: () => void) => {
      t += delay;
      timers.push(setTimeout(fn, t));
    };
    at(0, () => {
      setChars(0);
      setPhase(0);
    });
    at(700, () => undefined);
    for (let i = 1; i <= demo.request.length; i++) at(TYPE_MS, () => setChars(i));
    for (const [next, hold] of PHASES) at(hold, () => setPhase(next));
    at(FADE_MS, () => setCycle((c) => c + 1));
    return () => timers.forEach(clearTimeout);
  }, [reduced, visible, cycle, demo.request.length]);

  // Curseur piloté directement dans le DOM (position réelle du bouton « Envoyer ») :
  // aucune mise à jour d'état, donc aucun rendu supplémentaire pendant l'animation.
  useLayoutEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor || !panelRef.current || !sendRef.current) return;
    const on = phase >= 7 && phase <= 9;
    if (!on) {
      cursor.style.opacity = "0";
      cursor.style.transform = "translate(420px, 520px)";
      return;
    }
    const panel = panelRef.current.getBoundingClientRect();
    const send = sendRef.current.getBoundingClientRect();
    const x = send.left - panel.left + send.width * 0.55;
    const y = send.top - panel.top + send.height * 0.6;
    cursor.style.opacity = "1";
    cursor.style.transform = `translate(${x}px, ${y}px) scale(${phase === 8 ? 0.85 : 1})`;
  }, [phase]);

  const p = reduced ? 6 : phase;
  const stepsDone = Math.max(0, Math.min(demo.steps.length, p - 3));
  const working = p >= 2 && p < 6;
  const sent = p >= 9;

  return (
    <div ref={rootRef} className="w-full max-w-[30rem]">
      <p className="sr-only">
        {demo.label}. {demo.request} {demo.steps.join(". ")}. {demo.draftLabel}. {demo.body} {demo.pending}.
      </p>

      <div ref={panelRef} aria-hidden className="relative overflow-hidden rounded-panel bg-surface shadow-float">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
          <DonnaMark size={22} label="" />
          <span className="font-brand text-[0.9375rem] tracking-wordmark text-brand-strong">DONNA</span>
        </div>

        <div
          className={`relative h-[27rem] px-5 py-5 transition-opacity duration-(--duration-enter) ${
            p === 10 ? "opacity-0" : "opacity-100"
          }`}
        >
          {/* Accueil : visible tant que le message n'est pas envoyé. */}
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-4 transition-[opacity,transform] duration-500 ease-(--ease-enter) ${
              p === 0 ? "opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
            }`}
          >
            {/* Orbe : disponible, puis « écoute » pendant la saisie de la demande. */}
            <DonnaOrb state={chars > 0 && !reduced ? "listening" : "idle"} size={64} />
            <p className="font-brand text-[1.1875rem] font-light text-brand-strong">{demo.greeting}</p>
          </div>

          {p >= 1 && (
            <div className="flex flex-col gap-4">
              <p className="demo-in ml-auto max-w-[85%] rounded-card rounded-br-badge bg-active px-4 py-2.5 text-secondary text-ink">
                {demo.request}
              </p>

              {p >= 2 && (
                <div className="demo-in flex gap-3">
                  <span className="mt-0.5 inline-flex size-[30px] shrink-0 items-center justify-center">
                    {/* Réfléchit, agit pendant les étapes, puis répond avec le brouillon. */}
                    <DonnaOrb state={p === 2 ? "thinking" : working ? "working" : "answering"} size={30} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <p className="text-secondary font-medium text-ink">{demo.thinking}</p>

                    <ul className="flex flex-col gap-2">
                      {demo.steps.map((step, i) =>
                        p >= 3 + i ? (
                          <li
                            key={step}
                            className={`demo-in flex items-center gap-2 text-meta transition-colors duration-300 ${
                              i < stepsDone ? "text-ink-2" : "text-ink-3"
                            }`}
                          >
                            <StepIcon done={i < stepsDone} />
                            {step}
                          </li>
                        ) : null,
                      )}
                    </ul>

                    {/* Le brouillon se déploie (grille 0fr -> 1fr) au lieu d'apparaître d'un coup. */}
                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-500 ease-(--ease-enter) ${
                        p >= 6 ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="rounded-card border border-border bg-ivoire-50 p-4">
                          <div className="flex items-center justify-between gap-2 text-meta">
                            <span className="font-medium text-ink">{demo.draftLabel}</span>
                            <span className="relative h-5 min-w-44 whitespace-nowrap">
                              <span
                                className={`absolute inset-0 flex items-center justify-end gap-1.5 font-medium text-attention transition-opacity duration-300 ${
                                  sent ? "opacity-0" : "opacity-100"
                                }`}
                              >
                                <span className="pending-dot size-1.5 rounded-full bg-attention" />
                                {demo.pending}
                              </span>
                              <span
                                className={`absolute inset-0 flex items-center justify-end gap-1.5 text-success-ink transition-opacity duration-300 ${
                                  sent ? "opacity-100" : "opacity-0"
                                }`}
                              >
                                <StepIcon done />
                                {demo.sent}
                              </span>
                            </span>
                          </div>
                          <p className="mt-3 text-meta text-ink-3">{demo.to}</p>
                          <p className="mt-0.5 text-secondary font-medium text-ink">{demo.subject}</p>
                          <p className="mt-1.5 text-meta leading-5 text-ink-2">{demo.body}</p>
                          <div className={`mt-3.5 flex gap-2 transition-opacity duration-300 ${sent ? "opacity-40" : "opacity-100"}`}>
                            <span
                              ref={sendRef}
                              className={`rounded-button px-3 py-1.5 text-meta font-medium text-white transition-[transform,background-color,box-shadow] duration-150 ${
                                p === 8 ? "scale-95 bg-brand-fill-strong shadow-focus" : "bg-brand-fill"
                              }`}
                            >
                              {demo.send}
                            </span>
                            <span className="rounded-button bg-fill px-3 py-1.5 text-meta font-medium text-ink">{demo.edit}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-3.5">
          <p className="flex min-h-9 items-center rounded-button bg-page px-3 text-secondary">
            {p === 0 && chars > 0 && !reduced ? (
              <span className="text-ink">
                {demo.request.slice(0, chars)}
                <span className="demo-caret ml-px inline-block h-4 w-px translate-y-0.5 bg-brand-fill" />
              </span>
            ) : (
              <span className="text-ink-3">{demo.placeholder}</span>
            )}
          </p>
        </div>

        {/* Curseur : part du coin bas-droit, rejoint « Envoyer », clique, puis s'efface. */}
        {!reduced && (
          <svg
            ref={cursorRef}
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 drop-shadow-[0_2px_3px_rgb(44_32_32/0.25)] transition-[transform,opacity] duration-[900ms] ease-(--ease-enter)"
            style={{ opacity: 0, transform: "translate(420px, 520px)" }}
          >
            <path d="M5 3l14 8-6.2 1.6L10 19 5 3z" fill="#2c2c2c" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  );
}
