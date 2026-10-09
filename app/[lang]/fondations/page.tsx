import type { Metadata } from "next";
import { DonnaOrb } from "@/components/brand/donna-orb";

export const metadata: Metadata = { title: "Fondations · DONNA" };

type Swatch = { token: string; hex: string; note?: string; bordered?: boolean };

const brand: Swatch[] = [
  { token: "bordeaux-900", hex: "#591A29", note: "12,5:1 · texte de marque, survol" },
  { token: "bordeaux-700", hex: "#7C3040", note: "8,5:1 · accent d'action" },
  { token: "bordeaux-500", hex: "#8D3F4C", note: "6,8:1 · dégradé du logo" },
  { token: "rose-300", hex: "#E3ADAA", note: "Décoratif uniquement" },
  { token: "peche-100", hex: "#F8E5D8", note: "Tuile, disque de l'orbe", bordered: true },
  { token: "ivoire-50", hex: "#FDFAF8", note: "Surfaces de marque", bordered: true },
];

const ui: Swatch[] = [
  { token: "page", hex: "#FAF9F9", bordered: true },
  { token: "sidebar", hex: "#F8F7F7", bordered: true },
  { token: "surface", hex: "#FBFAFA", bordered: true },
  { token: "border", hex: "#EEEBEA" },
  { token: "active", hex: "#F3F0EF" },
  { token: "fill", hex: "#EEEAE8", note: "Bouton secondaire" },
  { token: "ink", hex: "#2C2C2C", note: "13,3:1" },
  { token: "ink-2", hex: "#6C6868", note: "5,2:1" },
  { token: "ink-3", hex: "#7F7978", note: "4,1:1" },
];

const states: Swatch[] = [
  { token: "success", hex: "#2F874E", note: "Icônes, pastilles" },
  { token: "success-ink", hex: "#23703F", note: "5,8:1 · texte" },
  { token: "success-soft", hex: "#E7F2EA", note: "Halo, badge" },
  { token: "danger", hex: "#C81424", note: "5,6:1 · erreurs" },
  { token: "notification", hex: "#EF4522", note: "Pastille uniquement" },
  { token: "pending", hex: "#ECEAE9", note: "Étapes à venir" },
];

const typeScale = [
  { token: "text-greeting", spec: "Figtree 500 · 26/34", sample: "Bonjour Azaël, on s'y met ?", cls: "text-greeting font-medium" },
  { token: "text-panel-title", spec: "Figtree 600 · 17/24", sample: "Traitement en cours", cls: "text-panel-title font-semibold" },
  { token: "text-message", spec: "Figtree 400 · 15/24", sample: "Peux-tu analyser les contrats fournisseurs signés ce trimestre ?", cls: "text-message" },
  { token: "text-label", spec: "Figtree 500 · 14/20", sample: "Compréhension de la requête", cls: "text-label font-medium" },
  { token: "text-secondary", spec: "Figtree 400 · 13/18", sample: "Analyse de l'intention et des entités", cls: "text-secondary text-ink-2" },
  { token: "text-caps", spec: "Figtree 600 · 11/16 · +0,06em", sample: "Conversations", cls: "text-caps font-semibold uppercase text-ink-2" },
  { token: "text-meta", spec: "Figtree 400 · 12/16 · tabulaire", sample: "10:24:12", cls: "text-meta tabular-nums text-ink-3" },
];

function SwatchGrid({ items, cols }: { items: Swatch[]; cols: string }) {
  return (
    <div className={`grid gap-4 ${cols}`}>
      {items.map((s) => (
        <div key={s.token} className="flex flex-col gap-2.5">
          <div
            className={`h-18 rounded-card ${s.bordered ? "shadow-card" : ""}`}
            style={{ backgroundColor: s.hex }}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-secondary font-semibold">{s.token}</span>
            <span className="font-mono text-meta text-ink-2">{s.hex}</span>
            {s.note && <span className="text-meta text-ink-2">{s.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-panel-title font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function FondationsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-14 px-18 py-16">
      <header className="flex flex-col gap-2.5">
        <span className="text-caps font-semibold uppercase text-brand">DONNA · Fondations</span>
        <h1 className="text-[2.5rem] leading-12 font-medium tracking-[-0.01em]">Tokens</h1>
        <p className="max-w-205 text-message text-ink-2 text-pretty">
          Palette unifiée de la planche d&apos;identité et de la maquette d&apos;écran. Chaque échantillon utilise
          directement la classe Tailwind du token.
        </p>
      </header>

      <Section title="Marque">
        <SwatchGrid items={brand} cols="grid-cols-6" />
        <div className="grid grid-cols-6 gap-4">
          {["bg-brand-fill-strong", "bg-brand-fill", "bg-brand-fill", "bg-rose-300", "bg-peche-100", "bg-ivoire-50"].map((c) => (
            <div key={c} className={`h-3 rounded-badge ${c} shadow-card`} title={`classe ${c}`} />
          ))}
        </div>
      </Section>

      <Section title="Interface">
        <SwatchGrid items={ui} cols="grid-cols-9" />
      </Section>

      <Section title="États">
        <SwatchGrid items={states} cols="grid-cols-6" />
      </Section>

      <Section title="Typographie">
        <div className="flex flex-col rounded-panel bg-surface shadow-card">
          <div className="grid grid-cols-[220px_minmax(0,1fr)] items-center gap-6 border-b border-border px-6 py-5">
            <div className="flex flex-col gap-0.5">
              <span className="text-secondary font-semibold">text-wordmark</span>
              <span className="font-mono text-meta text-ink-2">Jost 300 · 40/48 · +0,22em</span>
            </div>
            <span className="font-brand text-wordmark font-light text-brand-strong">DONNA</span>
          </div>
          <div className="grid grid-cols-[220px_minmax(0,1fr)] items-center gap-6 border-b border-border px-6 py-5">
            <div className="flex flex-col gap-0.5">
              <span className="text-secondary font-semibold">text-signature</span>
              <span className="font-mono text-meta text-ink-2">Jost 400 · 11/16 · +0,32em</span>
            </div>
            <span className="font-brand text-signature uppercase text-ink-2">powered by xcore</span>
          </div>
          {typeScale.map((t, i) => (
            <div
              key={t.token}
              className={`grid grid-cols-[220px_minmax(0,1fr)] items-center gap-6 px-6 py-5 ${i < typeScale.length - 1 ? "border-b border-border" : ""}`}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-secondary font-semibold">{t.token}</span>
                <span className="font-mono text-meta text-ink-2">{t.spec}</span>
              </div>
              <span className={t.cls}>{t.sample}</span>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-2 gap-8">
        <Section title="Rayons">
          <div className="grid grid-cols-6 items-end gap-4">
            {[
              ["rounded-badge", "6 · badge"],
              ["rounded-button", "8 · bouton"],
              ["rounded-nav", "10 · nav"],
              ["rounded-card", "12 · carte"],
              ["rounded-panel", "16 · panneau"],
              ["rounded-full", "plein · avatar"],
            ].map(([cls, label]) => (
              <div key={cls} className="flex flex-col items-center gap-2.5">
                <div className={`size-16 bg-active ring-1 ring-[#E3DEDC] ring-inset ${cls}`} />
                <span className="font-mono text-meta text-ink-2">{label}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Mouvement">
          <div className="grid grid-cols-2 gap-4">
            {[
              ["duration-fast · 120 ms", "Survol, pression, pastilles"],
              ["duration-standard · 200 ms", "Changement d'état, repli de panneau"],
              ["duration-enter · 320 ms", "ease-enter · messages, cartes"],
              ["duration-orb-loop · 2,4 s", "Figée si mouvement réduit"],
            ].map(([t, d]) => (
              <div key={t} className="flex flex-col gap-1 rounded-card bg-surface px-5 py-4 shadow-card">
                <span className="text-secondary font-semibold">{t}</span>
                <span className="text-secondary text-ink-2">{d}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Ombres et halos">
        <div className="grid grid-cols-5 gap-6 rounded-panel bg-active p-8">
          <div className="flex flex-col gap-3.5">
            <div className="h-24 rounded-card bg-surface shadow-card" />
            <span className="text-secondary font-semibold">shadow-card</span>
          </div>
          <div className="flex flex-col gap-3.5">
            <div className="h-24 rounded-panel bg-surface shadow-float" />
            <span className="text-secondary font-semibold">shadow-float</span>
          </div>
          <div className="flex flex-col gap-3.5">
            <div className="h-24 rounded-card bg-surface shadow-focus" />
            <span className="text-secondary font-semibold">shadow-focus</span>
          </div>
          <div className="flex flex-col gap-3.5">
            <div className="flex h-24 items-center justify-center">
              <div className="size-18 rounded-full bg-[radial-gradient(circle_at_50%_42%,#FDFAF8_0%,#F8E5D8_100%)] shadow-halo-brand" />
            </div>
            <span className="text-secondary font-semibold">shadow-halo-brand</span>
          </div>
          <div className="flex flex-col gap-3.5">
            <div className="flex h-24 items-center justify-center">
              <div className="size-18 rounded-full bg-[radial-gradient(circle_at_50%_42%,#FFFFFF_0%,#F1F8F3_100%)] shadow-halo-success" />
            </div>
            <span className="text-secondary font-semibold">shadow-halo-success</span>
          </div>
        </div>
      </Section>

      <Section title="Orbe — états">
        <div className="grid grid-cols-5 gap-6">
          {(["idle", "listening", "thinking", "working", "answering"] as const).map((state) => (
            <div key={state} className="flex flex-col items-center gap-3">
              <DonnaOrb state={state} size={120} />
              <div className="flex items-end gap-3">
                <DonnaOrb state={state} size={56} />
                <DonnaOrb state={state} size={32} />
              </div>
              <span className="text-secondary font-semibold">{state}</span>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
