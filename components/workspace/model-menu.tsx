"use client";

import { Cpu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import { writeModelChoice } from "@/lib/model-choice";
import { EFFORTS, estimatedCost, formatCost, groupByTier, resolveChoice, selectModel, type Effort, type Tier } from "@/lib/models";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useModelChoice, useModels } from "@/lib/use-model-choice";
import type { ModelOut } from "@/lib/workspace-types";

type Labels = Dictionary["workspace"]["chat"]["models"];

/**
 * Sélecteur de modèle du composer : trois niveaux (économique, équilibré, premium) et des essais gratuits, avec le
 * coût estimé d'un message et, pour les modèles qui raisonnent, l'effort. Le choix est mémorisé dans le navigateur
 * et envoyé avec chaque message ; le serveur n'accepte que les identifiants de son catalogue.
 * `below` : la barre est au milieu de la page (accueil), sans la place d'ouvrir ce menu vers le haut — il s'ouvre dessous, et sa hauteur est bornée par ce qui reste de l'écran.
 */
export function ModelMenu({ lang, labels, below = false }: { lang: Locale; labels: Labels; below?: boolean }) {
  const data = useModels();
  const choice = useModelChoice();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useFocusTrap(menuRef, open);
  const models = data?.models ?? null;
  const active = resolveChoice(choice, models);

  // Un choix qui n'existe plus côté serveur (clé retirée, niveau désactivé) est oublié : sinon chaque message serait refusé.
  useEffect(() => {
    if (models && choice && !models.some((m) => m.id === choice.id)) writeModelChoice(null);
  }, [models, choice]);

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

  // Rien à choisir (aucun catalogue, ou aucune clé configurée) : le composer reste inchangé.
  if (!models || models.length === 0) return null;

  const title = active ? `${labels.tiers[active.model.tier as Tier] ?? ""} · ${active.model.label}` : labels.defaultModel;
  const pick = (model: ModelOut) => writeModelChoice(selectModel(choice, model));
  const setEffort = (effort: Effort | null) => active && writeModelChoice({ id: active.model.id, effort });

  return (
    <div ref={ref} className="sm:relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        aria-label={`${labels.title} : ${title}`}
        title={`${labels.title} : ${title}`}
        className={`inline-flex h-9 max-w-[11rem] items-center gap-1.5 rounded-button px-2 text-meta transition-colors ${
          open ? "bg-active text-ink" : active ? "bg-brand/10 font-medium text-brand" : "text-ink-2 hover:bg-active hover:text-ink"
        }`}
      >
        <Cpu size={17} className="shrink-0" />
        {active && <span className="truncate">{active.model.label}</span>}
      </button>

      {open && (
        <div ref={menuRef} role="dialog" aria-label={labels.title} className={`absolute ${below ? "top-full mt-2 max-h-[min(34rem,calc(100dvh_-_24rem))]" : "bottom-full mb-2 max-h-[min(34rem,70dvh)]"} inset-x-0 z-30 sm:inset-x-auto sm:left-0 flex sm:w-[24rem] flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-float`}>
          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-2">
            <p className="px-2 pt-1 pb-1.5 text-meta text-ink-3">{labels.hint}</p>
            <Row selected={!active} onSelect={() => writeModelChoice(null)} title={labels.defaultModel} detail={data?.default_provider} />
            {groupByTier(models).map((group) => (
              <section key={group.tier} aria-label={labels.tiers[group.tier]} className="mt-2">
                <p className="px-2 pb-1 text-caps font-medium text-ink-3 uppercase">{labels.tiers[group.tier]}</p>
                {group.models.map((model) => {
                  const cost = estimatedCost(model);
                  return (
                    <Row
                      key={model.id}
                      selected={active?.model.id === model.id}
                      onSelect={() => pick(model)}
                      title={model.label}
                      badges={[model.recommended ? labels.recommended : null, model.reasoning ? labels.reasoning : null, model.vision ? labels.vision : null]}
                      detail={cost !== null ? labels.perMessage.replace("{cost}", formatCost(cost, lang)) : model.tier === "free" ? labels.free : null}
                    />
                  );
                })}
                {group.tier === "free" && <p className="px-2 pt-1 text-meta text-ink-3 text-pretty">{labels.freeNote}</p>}
              </section>
            ))}
          </div>

          {active?.model.reasoning && (
            <div className="border-t border-border p-3">
              <p className="mb-1.5 text-label font-medium text-ink">{labels.effort}</p>
              <div role="radiogroup" aria-label={labels.effort} className="flex gap-1 rounded-button bg-active p-0.5">
                {([null, ...EFFORTS] as (Effort | null)[]).map((effort) => (
                  <button
                    key={effort ?? "auto"}
                    type="button"
                    role="radio"
                    aria-checked={active.effort === effort}
                    onClick={() => setEffort(effort)}
                    className={`flex-1 rounded-badge px-2 py-1 text-meta font-medium transition-colors ${active.effort === effort ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink-2"}`}
                  >
                    {effort ? labels.efforts[effort] : labels.efforts.auto}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-meta text-ink-3 text-pretty">{labels.effortHint}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  selected,
  onSelect,
  title,
  badges = [],
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  badges?: (string | null)[];
  detail?: string | null;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 rounded-button px-2 py-1.5 text-left hover:bg-active ${selected ? "bg-brand/10" : ""}`}
    >
      <span className="min-w-0">
        <span className={`block truncate text-label ${selected ? "font-medium text-brand" : "text-ink"}`}>{title}</span>
        {badges.some(Boolean) && (
          <span className="mt-0.5 flex flex-wrap gap-1">
            {badges.filter(Boolean).map((badge) => (
              <span key={badge} className="rounded-badge bg-fill px-1.5 text-micro leading-4 text-ink-2">
                {badge}
              </span>
            ))}
          </span>
        )}
      </span>
      {detail && <span className="shrink-0 text-meta text-ink-3 tabular-nums">{detail}</span>}
    </button>
  );
}
