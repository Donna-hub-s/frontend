"use client";

import { Check, Copy, Download, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { svgToPngBase64, withPlainLabels } from "@/lib/diagram-image";
import { initialZoom, inlineBox, naturalSize, stepZoom, zoomedWidth, type Size } from "@/lib/mermaid-size";
import { Dialog, DialogHeader } from "./dialog";

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

type State = { status: "loading" } | { status: "error" } | { status: "ready"; svg: string; size: Size };

export type MermaidLabels = {
  invalid: string;
  title: string;
  expand: string;
  copy: string;
  copied: string;
  download: string;
  downloadFailed: string;
  close: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
};

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

const DEFAULT_SIZE: Size = { width: 960, height: 540 }; // sortie sans dimension lisible : un cadre large plutôt qu'un carré étriqué
// Diagramme déraisonnablement long : Mermaid resterait à l'analyser pendant que la réponse attend d'être lue.
const MAX_SOURCE_LENGTH = 20_000;

/**
 * Une source Mermaid en SVG. Partagé par ce composant (réponses de DONNA) et par l'aperçu d'un document
 * partagé (`lib/canvas-preview.ts`), qui dessine ici et ne pose que le SVG dans sa page — une seule
 * initialisation du moteur, une seule configuration de sécurité pour les deux.
 * `id` sert de sélecteur CSS interne à Mermaid : il doit être unique dans la page et alphanumérique.
 * `plainLabels` : étiquettes en SVG pur (pas de `<foreignObject>`), pour le convertir en image — voir `lib/diagram-image.ts`.
 */
export async function renderMermaidSvg(source: string, id: string, options: { plainLabels?: boolean } = {}): Promise<string> {
  if (source.length > MAX_SOURCE_LENGTH) throw new Error("Diagramme trop long");
  const mermaid = await loadMermaid();
  const { svg } = await mermaid.render(`mermaid-${id}`, options.plainLabels ? withPlainLabels(source) : source);
  return svg;
}

/**
 * Le document du cadre : le SVG, étiré à la taille du cadre (Mermaid écrit `width="100%"` et un `max-width` en style, qu'il faut
 * écraser). Le cadre fixe la taille, le SVG la remplit en gardant ses proportions.
 */
const frameDocument = (svg: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:transparent}svg{display:block;width:100%!important;height:100%!important;max-width:none!important}</style></head><body>${svg}</body></html>`;

/** Télécharge un PNG du diagramme (dessiné à part, en étiquettes simples : le SVG affiché ne peut pas être exporté, voir diagram-image.ts). */
async function downloadPng(source: string, id: string): Promise<boolean> {
  try {
    const png = await svgToPngBase64(await renderMermaidSvg(source, `${id}png`, { plainLabels: true }));
    if (!png) return false;
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${png}`;
    link.download = "diagramme.png";
    link.click();
    return true;
  } catch {
    return false;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const TOOL = "inline-flex size-7 items-center justify-center rounded-button text-ink-3 hover:bg-active hover:text-ink focus-visible:outline-2 disabled:opacity-40";

export function MermaidDiagram({ source, labels }: { source: string; labels: MermaidLabels }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "") || "x"; // l'id sert de sélecteur CSS interne à Mermaid
  const [state, setState] = useState<State>({ status: "loading" });
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const svg = await renderMermaidSvg(source, id);
        if (!cancelled) setState({ status: "ready", svg, size: naturalSize(svg) ?? DEFAULT_SIZE });
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

  const copy = async () => {
    if (await copyText(source)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  const download = async () => setDownloadFailed(!(await downloadPng(source, id)));

  const tools = (
    <>
      <button type="button" className={TOOL} onClick={() => void copy()} aria-label={labels.copy} title={labels.copy}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
      <button type="button" className={TOOL} onClick={() => void download()} aria-label={labels.download} title={labels.download}>
        <Download size={15} />
      </button>
    </>
  );

  return (
    <div className="my-3 w-full max-w-full rounded-card bg-surface">
      <div className="flex items-center justify-end gap-0.5 px-2 pt-1.5">
        {downloadFailed && <span role="status" className="mr-auto text-meta text-danger">{labels.downloadFailed}</span>}
        {tools}
        <button type="button" className={TOOL} onClick={() => setExpanded(true)} aria-label={labels.expand} title={labels.expand}>
          <Maximize2 size={15} />
        </button>
      </div>
      {/* Taille naturelle, réduite pour tenir dans la colonne sans jamais passer sous MIN_SCALE : au-delà, le cadre défile. */}
      <div className="max-h-[70vh] overflow-auto px-3 pb-3">
        <iframe title={labels.title} sandbox="" className="block border-0" style={inlineBox(state.size)} srcDoc={frameDocument(state.svg)} />
      </div>
      {expanded && <ExpandedDiagram svg={state.svg} size={state.size} labels={labels} tools={tools} onClose={() => setExpanded(false)} />}
    </div>
  );
}

/** Le diagramme en grand : zoom au clic, défilement dans les deux sens. Un cadre `sandbox=""`, comme dans le fil. */
function ExpandedDiagram({ svg, size, labels, tools, onClose }: { svg: string; size: Size; labels: MermaidLabels; tools: ReactNode; onClose: () => void }) {
  const available = typeof window === "undefined" ? 960 : Math.min(window.innerWidth - 64, 1000);
  const [zoom, setZoom] = useState(() => initialZoom(size, available));
  return (
    <Dialog open onClose={onClose} label={labels.title} className="flex max-w-[64rem] flex-col">
      <DialogHeader title={labels.title} closeLabel={labels.close} onClose={onClose}>
        <div className="flex items-center gap-0.5">
          <button type="button" className={TOOL} onClick={() => setZoom((z) => stepZoom(z, -1))} aria-label={labels.zoomOut} title={labels.zoomOut}>
            <ZoomOut size={15} />
          </button>
          <button type="button" className="rounded-button px-2 text-meta tabular-nums text-ink-2 hover:bg-active" onClick={() => setZoom(initialZoom(size, available))} title={labels.fit}>
            {Math.round(zoom * 100)} %
          </button>
          <button type="button" className={TOOL} onClick={() => setZoom((z) => stepZoom(z, 1))} aria-label={labels.zoomIn} title={labels.zoomIn}>
            <ZoomIn size={15} />
          </button>
          {tools}
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-auto bg-surface p-4">
        <iframe
          title={labels.title}
          sandbox=""
          className="block border-0"
          style={{ width: zoomedWidth(size, zoom), height: Math.round(zoomedWidth(size, zoom) * (size.height / size.width)) }}
          srcDoc={frameDocument(svg)}
        />
      </div>
    </Dialog>
  );
}
