"use client";

import { useEffect, useId, useState } from "react";

// Un bloc ```mermaid``` est rendu en diagramme, jamais pendant le flux (voir markdown.tsx : une syntaxe à
// moitié écrite ne se dessine pas, elle échoue — et redessiner à chaque jeton coûterait cher). Chargé à la
// demande (le modèle est volumineux) : jamais importé tant qu'aucun diagramme n'apparaît.
//
// Défense en profondeur, même logique que `document_render.py` côté serveur (« trois barrières
// indépendantes ») : 1) version figée, postérieure aux CVE connues de Mermaid (2026-41148/41149/41159,
// injection CSS/HTML par les attributs `classDef`/`fontFamily`/`themeCSS`) ; 2) `securityLevel: "strict"`,
// jamais "loose" (la case d'Open WebUI : une vraie XSS stockée, trouvée en marge de ce travail) et aucune
// valeur dérivée du texte du diagramme n'entre jamais dans la configuration (thème fixe, pas de fontFamily
// choisie par le diagramme) ; 3) le SVG produit est posé dans un <iframe sandbox=""> (AUCUNE permission :
// ni script, ni accès à la même origine) plutôt que dans le DOM de la page — une deuxième barrière qui ne
// dépend pas d'avoir bien deviné ce que la sanitisation interne de Mermaid couvre.

type State = { status: "loading" } | { status: "error" } | { status: "ready"; svg: string; ratio: number };

export type MermaidLabels = { invalid: string };

/** Jamais dérivé du texte du diagramme : une configuration fixe, prise des jetons de couleur de DONNA. */
function mermaidTheme() {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: "transparent",
    primaryColor: read("--color-active", "#f3f0ef"),
    primaryTextColor: read("--color-ink", "#241f1a"),
    primaryBorderColor: read("--color-border", "#e7ddd1"),
    lineColor: read("--color-ink-3", "#9a9089"),
    secondaryColor: read("--color-surface", "#ffffff"),
    tertiaryColor: read("--color-page", "#faf7f2"),
    fontFamily: "Figtree, system-ui, sans-serif",
  };
}

// `theme`/`themeVariables`/`fontFamily` NE SONT PAS dans la liste `secure` par défaut de Mermaid
// (seulement securityLevel/startOnLoad/maxTextSize/…) : un bloc `%%{init: {...}}%%` dans le texte
// du diagramme les écrase SINON — vérifié en pratique (un diagramme avec son propre init
// imposait sa propre palette, malgré la configuration fixe ci-dessous). `secure` est la seule
// chose qu'une directive ne peut jamais changer, d'après la doc Mermaid elle-même.
const SECURE_KEYS = ["secure", "securityLevel", "startOnLoad", "maxTextSize", "suppressErrorRendering", "maxEdges", "theme", "themeVariables", "fontFamily"];

let loaded: Promise<typeof import("mermaid")["default"]> | null = null;
/** Une seule initialisation pour toute la session : `mermaid.initialize` ne doit être appelé qu'une fois. */
function loadMermaid() {
  loaded ??= import("mermaid").then((mod) => {
    const mermaid = mod.default;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", secure: SECURE_KEYS, theme: "base", themeVariables: mermaidTheme() });
    return mermaid;
  });
  return loaded;
}

const VIEWBOX = /viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/;
const DEFAULT_RATIO = 16 / 9; // sortie sans dimension lisible : un cadre large plutôt qu'un carré étriqué
// Diagramme déraisonnablement long : Mermaid resterait à l'analyser pendant que la réponse attend d'être lue.
const MAX_SOURCE_LENGTH = 20_000;

/**
 * Une source Mermaid en SVG. Partagé par ce composant (réponses de DONNA) et par l'aperçu d'un document
 * partagé (`lib/canvas-preview.ts`), qui dessine ici et ne pose que le SVG dans sa page — une seule
 * initialisation du moteur, une seule configuration de sécurité pour les deux.
 * `id` sert de sélecteur CSS interne à Mermaid : il doit être unique dans la page et alphanumérique.
 */
export async function renderMermaidSvg(source: string, id: string): Promise<string> {
  if (source.length > MAX_SOURCE_LENGTH) throw new Error("Diagramme trop long");
  const mermaid = await loadMermaid();
  const { svg } = await mermaid.render(`mermaid-${id}`, source);
  return svg;
}

export function MermaidDiagram({ source, labels }: { source: string; labels: MermaidLabels }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "") || "x"; // l'id sert de sélecteur CSS interne à Mermaid
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const svg = await renderMermaidSvg(source, id);
        if (cancelled) return;
        const match = VIEWBOX.exec(svg);
        const ratio = match ? Number(match[1]) / Number(match[2]) : DEFAULT_RATIO;
        setState({ status: "ready", svg, ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_RATIO });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (state.status === "loading") return <div className="my-3 h-32 animate-pulse rounded-card bg-active" aria-hidden />;

  if (state.status === "error") {
    return (
      <div className="my-3 overflow-hidden rounded-card bg-active">
        <p className="px-4 py-2 text-meta text-danger">{labels.invalid}</p>
        <pre className="donna-code overflow-x-auto px-4 pb-4 text-[0.8125rem]">
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="my-3 w-full max-w-full overflow-hidden rounded-card bg-surface p-3" style={{ aspectRatio: state.ratio }}>
      <iframe
        title="Diagramme"
        sandbox=""
        className="size-full border-0"
        srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;display:flex;align-items:center;justify-content:center;height:100%}svg{max-width:100%;max-height:100%}</style></head><body>${state.svg}</body></html>`}
      />
    </div>
  );
}
