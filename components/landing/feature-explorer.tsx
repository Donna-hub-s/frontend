"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";

type Features = Dictionary["features"];

const ROTATE_MS = 8000;

/** Onglets ARIA : défilement automatique jusqu'à la première interaction, flèches au clavier. */
export function FeatureExplorer({ features, alts }: { features: Features; alts: Record<string, string> }) {
  const [active, setActive] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const [hovered, setHovered] = useState(false);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const count = features.items.length;

  useEffect(() => {
    if (interacted || hovered || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(id);
  }, [interacted, hovered, count]);

  const select = (index: number, focus = false) => {
    setInteracted(true);
    setActive(index);
    if (focus) tabsRef.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (event.key in moves) {
      event.preventDefault();
      select((active + moves[event.key] + count) % count, true);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      select(event.key === "Home" ? 0 : count - 1, true);
    }
  };

  const item = features.items[active];

  return (
    <div
      className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        role="tablist"
        aria-label={features.tabsLabel}
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
      >
        {features.items.map((feature, index) => {
          const selected = index === active;
          return (
            <button
              key={feature.id}
              ref={(el) => {
                tabsRef.current[index] = el;
              }}
              role="tab"
              id={`tab-${feature.id}`}
              aria-selected={selected}
              aria-controls={`panel-${feature.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(index)}
              className={`relative shrink-0 overflow-hidden rounded-nav px-4 py-3 text-left text-label font-medium whitespace-nowrap transition-colors duration-(--duration-fast) ${
                selected ? "bg-brand-fill-strong text-white" : "text-ink-2 hover:bg-active hover:text-ink"
              }`}
            >
              {feature.tab}
              {selected && !interacted && (
                <span
                  key={active}
                  aria-hidden
                  className="feature-progress absolute bottom-0 left-0 h-0.5 bg-rose-300"
                  style={{ animationDuration: `${ROTATE_MS}ms` }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        key={item.id}
        role="tabpanel"
        id={`panel-${item.id}`}
        aria-labelledby={`tab-${item.id}`}
        className="feature-in grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12"
      >
        <figure className="flex flex-col items-center gap-3">
          <Image
            src={`/illustrations/${item.image}.svg`}
            alt={alts[item.image] ?? ""}
            width={420}
            height={320}
            className="feature-illustration h-auto max-h-80 w-full object-contain"
          />
        </figure>
        <div>
          <h3 className="font-brand text-[clamp(1.75rem,3vw,2.25rem)] leading-[1.15] font-light text-brand-strong text-balance">
            {item.title}
          </h3>
          <p className="mt-5 text-meta text-ink-3">{features.exampleLabel}</p>
          <p className="mt-1.5 rounded-card rounded-bl-badge bg-active px-4 py-3 text-message text-ink">
            {features.quote[0]}
            {item.example}
            {features.quote[1]}
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {item.points.map((point) => (
              <li key={point} className="flex gap-3 text-message text-ink-2">
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden className="mt-1 shrink-0 text-brand">
                  <path d="M4 10.5l3.5 3.5L16 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-pretty">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
