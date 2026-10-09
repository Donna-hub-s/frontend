"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import { connectorName, disabledCount, skillDescription, skillEnabled, skillLabel } from "@/lib/skills";
import { SlidersIcon } from "./icons";
import { useWorkspace } from "./workspace-provider";

/**
 * Raccourci du chat : activer ou couper une compétence sans passer par les paramètres.
 * Chaque interrupteur s'enregistre tout de suite (pas de bouton « Enregistrer ») et vaut dès le
 * prochain message. Une pastille signale qu'au moins une compétence est coupée : c'est ce qui
 * explique pourquoi DONNA refuserait de faire quelque chose.
 * `below` : la barre est au milieu de la page (accueil), sans la place d'ouvrir ce menu vers le haut — il s'ouvre dessous.
 */
export function SkillsMenu({ lang, labels, below = false }: { lang: Locale; labels: Dictionary["workspace"]["chat"]; below?: boolean }) {
  const { skills, skillSettings, setSkillEnabled, refreshSkills, setSettingsOpen } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
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

  const off = skills ? disabledCount(skills, skillSettings) : 0;
  const title = off ? labels.skillsOff.replace("{n}", String(off)) : labels.skillsMenu;

  const toggle = async (id: string, enabled: boolean) => {
    setPending(id);
    setSaveFailed(false);
    const ok = await setSkillEnabled(id, enabled);
    setPending(null);
    setSaveFailed(!ok);
  };

  return (
    <div ref={ref} className="sm:relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void refreshSkills(); // un autre onglet ou les paramètres ont pu les changer
        }}
        aria-label={title}
        title={title}
        className={`relative flex size-9 items-center justify-center rounded-button transition-colors ${
          open ? "bg-active text-ink" : "text-ink-2 hover:bg-active hover:text-ink"
        }`}
      >
        <SlidersIcon size={18} />
        {off > 0 && <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full border border-white bg-brand-fill" />}
      </button>

      {open && (
        <div role="group" aria-label={labels.skillsMenu} className={`absolute ${below ? "top-full mt-2" : "bottom-full mb-2"} inset-x-0 z-30 sm:inset-x-auto sm:left-0 sm:w-[20rem] rounded-panel border border-border bg-surface p-2 shadow-float`}>
          <p className="px-2 pt-1 pb-2 text-meta text-ink-3">{labels.skillsMenuHint}</p>
          {!skills ? (
            <p className="px-2 py-3 text-secondary text-ink-3">…</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {skills.map((skill) => {
                const enabled = skillEnabled(skill, skillSettings);
                return (
                  <li key={skill.id}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      disabled={pending === skill.id}
                      onClick={() => void toggle(skill.id, !enabled)}
                      title={skillDescription(skill, lang)}
                      className="flex w-full items-center justify-between gap-3 rounded-button px-2 py-2 text-left hover:bg-active disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-label text-ink">{skillLabel(skill, lang)}</span>
                        {skill.missing.length > 0 && (
                          <span className="block truncate text-meta text-danger">
                            {labels.skillsMissing.replace("{connectors}", skill.missing.map(connectorName).join(", "))}
                          </span>
                        )}
                      </span>
                      <span aria-hidden className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? "bg-brand-fill" : "bg-active"}`}>
                        <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-card transition-transform ${enabled ? "translate-x-4" : ""}`} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {saveFailed && <p role="alert" className="px-2 pt-1 text-meta text-danger">{labels.skillsSaveError}</p>}
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
              className="w-full rounded-button px-2 py-1.5 text-left text-label text-ink-2 hover:bg-active hover:text-ink"
            >
              {labels.skillsManage}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
