"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { Locale } from "@/i18n/config";
import { isBareHome, recentConversations } from "@/lib/home";
import { parseBackendDate } from "@/lib/workspace-types";
import { ChevronIcon, GlobeIcon, PaperclipIcon } from "./icons";
import { ProjectIcon } from "./project-icon";
import { PendingItem } from "./side-panel";
import { useWorkspace } from "./workspace-provider";
import { AudioLines } from "lucide-react";

type WorkspaceDict = Dictionary["workspace"];

const MAX_PROJECTS = 4;
/** Au-delà, l'accueil cesserait d'être un aperçu : la page « À valider » prend le relais. */
const MAX_PENDING = 3;

/**
 * Accueil d'une nouvelle conversation.
 *
 * Ce n'était qu'une zone de saisie centrée, c'est-à-dire le geste universel du
 * « demande et pars » : rien à l'écran ne disait ce qui attendait la personne, ni ce
 * qu'elle avait laissé en cours. Tout était pourtant déjà chargé par le layout
 * (actions en attente, conversations, projets) et n'allait nulle part.
 *
 * L'ordre est délibéré : la saisie d'abord — c'est toujours un produit de
 * conversation —, puis CE QUI ATTEND UNE DÉCISION, qui est la promesse même du
 * produit, puis ce qu'on peut reprendre. Un compte vide ne montre rien de tout
 * cela et retombe sur des suggestions : une liste de sections vides serait pire
 * que la page d'avant.
 */
export function HomeScreen({
  lang,
  dict,
  firstName,
  composer,
}: {
  lang: Locale;
  dict: WorkspaceDict;
  firstName: string | null;
  /** La barre de saisie, fournie par la conversation (elle seule sait envoyer et diffuser).
   * `shortcuts` : afficher les raccourcis de découverte, réservés au compte encore vide. */
  composer: (shortcuts: boolean) => ReactNode;
}) {
  const { pending, conversations, projects, notices, resolveThreadKey } = useWorkspace();

  // Tri et seuils : logique pure, testée dans lib/home.test.ts.
  const recent = recentConversations(conversations);
  const bare = isBareHome(pending.length, recent.length);

  return (
    <div className="mt-[8vh] flex flex-col items-center">
      <h1 className="msg-enter max-w-[34rem] text-center font-brand text-greeting font-light text-brand-strong text-pretty">
        {firstName ? dict.chat.homeTitleName.replace("{name}", firstName) : dict.chat.homeTitle}
      </h1>
      <div className="mt-6 w-full">{composer(bare)}</div>

      {!bare && (
        <div className="msg-enter mt-10 flex w-full max-w-[34rem] flex-col gap-8" style={{ animationDelay: "90ms" }}>
          {pending.length > 0 && (
            <section aria-labelledby="home-pending">
              <h2 id="home-pending" className="mb-2 flex items-center gap-2 text-caps font-medium text-ink-3 uppercase">
                {dict.panel.pending}
                <span className="rounded-full bg-attention-fill px-1.5 text-meta font-medium text-white tabular-nums">{pending.length}</span>
              </h2>
              <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-panel border border-attention/40 bg-attention-soft">
                {pending.slice(0, MAX_PENDING).map((action) => (
                  <PendingItem key={action.id} lang={lang} dict={dict} action={action} />
                ))}
              </ul>
              {/* Au-delà, l'accueil deviendrait une file d'attente : la page dédiée est là pour ça. */}
              {pending.length > MAX_PENDING && (
                <Link
                  href={`/${lang}/app/approvals`}
                  className="mt-2 inline-flex items-center gap-1 text-meta font-medium text-ink-2 no-underline hover:text-ink"
                >
                  {dict.chat.homeApprovalsAll.replace("{n}", String(pending.length))}
                  <ChevronIcon size={13} className="-rotate-90" />
                </Link>
              )}
            </section>
          )}

          {recent.length > 0 && (
            <section aria-labelledby="home-recent">
              <h2 id="home-recent" className="mb-2 text-caps font-medium text-ink-3 uppercase">
                {dict.chat.homeResume}
              </h2>
              <ul className="flex flex-col overflow-hidden rounded-panel border border-border bg-surface">
                {recent.map((conversation) => {
                  const project = projects.find((p) => p.id === conversation.project_id);
                  const at = parseBackendDate(conversation.updated_at ?? conversation.created_at ?? "");
                  const unread = Boolean(notices[resolveThreadKey(conversation.id)]);
                  return (
                    <li key={conversation.id} className="border-b border-border last:border-b-0">
                      <Link
                        href={`/${lang}/app/c/${conversation.id}`}
                        className="flex items-center gap-2.5 px-4 py-3 text-label text-ink no-underline hover:bg-active hover:text-ink"
                      >
                        {unread && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-attention" />}
                        <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                        {project && (
                          <span className="shrink-0 rounded-badge bg-peche-100 px-2 py-0.5 text-meta font-medium text-brand-strong">
                            {project.name}
                          </span>
                        )}
                        {at && (
                          <time className="shrink-0 text-meta text-ink-3 tabular-nums" suppressHydrationWarning>
                            {new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(at)}
                          </time>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {projects.length > 0 && (
            <section aria-labelledby="home-projects">
              <h2 id="home-projects" className="mb-2 text-caps font-medium text-ink-3 uppercase">
                {dict.chat.homeProjects}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {projects.slice(0, MAX_PROJECTS).map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/${lang}/app/projects/${project.id}`}
                      className="inline-flex items-center gap-1.5 rounded-badge border border-border bg-surface px-2.5 py-1.5 text-meta font-medium text-ink no-underline hover:border-brand/30 hover:text-ink"
                    >
                      <ProjectIcon icon={project.icon} size={14} className="text-brand" />
                      {project.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={`/${lang}/app/projects`}
                    className="inline-flex items-center gap-1 rounded-badge px-2.5 py-1.5 text-meta font-medium text-ink-2 no-underline hover:text-ink"
                  >
                    {dict.chat.homeProjectsAll}
                    <ChevronIcon size={13} className="-rotate-90" />
                  </Link>
                </li>
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Gestes de découverte, montrés seulement tant qu'il n'y a rien à reprendre.
 *
 * Chacun FAIT quelque chose — ouvre le sélecteur de fichiers, active la recherche Web, lance le mode vocal — au lieu
 * de pré-remplir la saisie d'un début de phrase (« Crée une image de… ») : ces amorces apprenaient que DONNA est une
 * boîte à prompts, et un utilisateur qui les complétait écrivait exactement ce qu'il aurait écrit sans elles. Ce sont
 * les mêmes gestes que les boutons de la barre, mais nommés. Le mode vocal est absent quand la barre n'a pas de voix.
 */
export function HomeShortcuts({
  labels,
  voiceLabel,
  onAttach,
  onWebSearch,
  onVoice,
}: {
  labels: WorkspaceDict["chat"];
  voiceLabel: string;
  onAttach: () => void;
  onWebSearch: () => void;
  onVoice?: () => void;
}) {
  const row = "flex w-full items-center gap-2.5 rounded-card px-3 py-2.5 text-left text-label text-ink-2 transition-colors hover:bg-active hover:text-ink";
  return (
    <ul className="msg-enter mx-auto mt-3 flex w-full max-w-[34rem] flex-col gap-1" style={{ animationDelay: "90ms" }}>
      <li>
        <button type="button" onClick={onAttach} className={row}>
          <PaperclipIcon size={18} className="text-brand" />
          {labels.homeAttach}
        </button>
      </li>
      <li>
        <button type="button" onClick={onWebSearch} className={row}>
          <GlobeIcon size={18} className="text-brand" />
          {labels.homeWebSearch}
        </button>
      </li>
      {onVoice && (
        <li>
          <button type="button" onClick={onVoice} className={row}>
            <AudioLines size={18} aria-hidden className="text-brand" />
            {voiceLabel}
          </button>
        </li>
      )}
    </ul>
  );
}
