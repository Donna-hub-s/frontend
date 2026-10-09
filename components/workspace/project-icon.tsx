// Icône de projet : une clé choisie parmi un ensemble restreint (même liste
// que backend/app/chat/src/schemas.py::PROJECT_ICONS — garder synchronisées),
// rendue avec lucide-react, ou le dossier par défaut si aucune n'a été choisie
// (ou si la clé est inconnue, ex. un ancien emoji stocké avant ce format).
import {
  Briefcase,
  Calendar,
  ChartColumn,
  Folder,
  Lightbulb,
  Palette,
  Puzzle,
  Rocket,
  Star,
  Target,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  folder: Folder,
  briefcase: Briefcase,
  rocket: Rocket,
  target: Target,
  chart: ChartColumn,
  lightbulb: Lightbulb,
  wrench: Wrench,
  calendar: Calendar,
  palette: Palette,
  "trending-up": TrendingUp,
  puzzle: Puzzle,
  star: Star,
} satisfies Record<string, LucideIcon>;

export type ProjectIconKey = keyof typeof ICONS;

export const PROJECT_ICONS = Object.keys(ICONS) as ProjectIconKey[];

function isProjectIconKey(value: string): value is ProjectIconKey {
  return Object.hasOwn(ICONS, value);
}

/** Affiche l'icône d'un projet : celle choisie, sinon le dossier par défaut. */
export function ProjectIcon({
  icon,
  size = 16,
  className,
}: {
  icon: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const Glyph = icon && isProjectIconKey(icon) ? ICONS[icon] : Folder;
  return <Glyph size={size} className={`shrink-0 ${className ?? ""}`} />;
}

/** Sélecteur d'icône — grille de boutons, une seule icône sélectionnable à la fois. */
export function ProjectIconPicker({
  value,
  onChange,
  label,
  names,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
  label: string;
  /** Libellé accessible (traduit) de chaque icône. */
  names: Record<ProjectIconKey, string>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label font-medium text-ink">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {PROJECT_ICONS.map((key) => {
          const Glyph = ICONS[key];
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(selected ? null : key)}
              aria-pressed={selected}
              aria-label={names[key]}
              title={names[key]}
              className={`flex size-9 items-center justify-center rounded-button border transition-colors ${
                selected ? "border-brand bg-peche-100 text-brand" : "border-border text-ink-2 hover:bg-active"
              }`}
            >
              <Glyph size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
