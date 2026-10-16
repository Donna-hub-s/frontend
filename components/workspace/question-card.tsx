"use client";

/**
 * La carte de questions d'une réponse (`ask_user`). Une ou plusieurs questions typées — oui/non,
 * choix unique, choix multiple — plus un champ de précision libre, répondues ENSEMBLE : un seul
 * message part, donc un seul tour de modèle.
 *
 * Deux états. **Répondue** (`answered` fourni) : plus aucun contrôle, on relit ce qui a été coché —
 * c'est ce qui rend le fil cohérent après un rechargement, où la carte réapparaissait vierge
 * au-dessus de sa propre réponse. **À répondre** : les contrôles, et un envoi qui n'est possible
 * que si quelque chose a été choisi ou écrit (une carte n'oblige à rien, mais un message vide n'a
 * aucun sens).
 *
 * Le serveur reste l'autorité : il valide chaque choix contre la carte qu'il a réellement posée et
 * compose lui-même le texte du message (questions.py). Ici, rien d'autre que de la saisie.
 *
 * Extrait de conversation.tsx : le composant ne dépend que de `useState` et des aides pures de
 * `@/lib/questions`.
 */

import { useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { type Answers, hasAnything, NO, type Question, type QuestionCard as QuestionCardData, YES } from "@/lib/questions";
import type { QuestionAnswersOut } from "@/lib/workspace-types";

type WorkspaceDict = Dictionary["workspace"];

export function QuestionCard({
  dict,
  card,
  answered,
  disabled,
  onSubmit,
}: {
  dict: WorkspaceDict;
  card: QuestionCardData;
  /** Réponses déjà données (message suivant) : la carte devient une relecture. */
  answered?: QuestionAnswersOut;
  disabled: boolean;
  onSubmit: (answers: Answers, freeText: string) => Promise<boolean>;
}) {
  const { chat } = dict;
  const [answers, setAnswers] = useState<Answers>({});
  const [freeText, setFreeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const labelOf = (question: Question, value: string) =>
    question.type === "yes_no" ? (value === YES ? chat.questionYes : chat.questionNo) : value;
  const choicesOf = (question: Question) => (question.type === "yes_no" ? [YES, NO] : question.options);

  const toggle = (question: Question, value: string) =>
    setAnswers((current) => {
      const picked = current[question.id] ?? [];
      if (question.type === "multi") {
        return { ...current, [question.id]: picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value] };
      }
      // Choix unique : recliquer le même le retire (sinon on ne peut plus « dé-répondre »).
      return { ...current, [question.id]: picked[0] === value ? [] : [value] };
    });

  const send = async () => {
    if (busy || !hasAnything(answers, freeText)) return;
    setBusy(true);
    setFailed(false);
    const ok = await onSubmit(answers, freeText.trim());
    setBusy(false);
    if (!ok) setFailed(true);
  };

  const readOnly = Boolean(answered) || disabled;
  const shown: Answers = answered?.answers ?? answers;

  return (
    <div className="rounded-panel border border-rose-300/60 bg-surface p-4">
      <p className="text-meta text-brand">{answered ? chat.questionAnswered : chat.questionLabel}</p>
      <div className="mt-2 flex flex-col gap-3">
        {card.questions.map((question) => {
          const picked = shown[question.id] ?? [];
          return (
            <fieldset key={question.id} className="border-0 p-0">
              <legend className="text-message text-ink">{question.question}</legend>
              <div role="group" aria-label={chat.optionsLabel} className="mt-2 flex flex-wrap gap-2">
                {choicesOf(question).map((value) => {
                  const on = picked.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      // `aria-pressed` plutôt que des vraies cases : le contrôle est un bouton, et
                      // son état coché/décoché doit être annoncé comme tel.
                      aria-pressed={on}
                      disabled={readOnly}
                      onClick={() => toggle(question, value)}
                      className={`rounded-full border px-3 py-1.5 text-label transition-colors ${
                        on ? "border-brand bg-brand/10 font-medium text-brand-strong" : "border-border bg-surface text-ink"
                      } ${readOnly ? "disabled:opacity-100" : "hover:border-brand/40"} ${readOnly && !on ? "opacity-45" : ""}`}
                    >
                      {labelOf(question, value)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {answered ? (
          answered.free_text && (
            <p className="text-secondary text-ink-2">
              <span className="text-meta text-ink-3">{chat.questionNote} : </span>
              {answered.free_text}
            </p>
          )
        ) : (
          card.allowFreeText && (
            <label className="flex flex-col gap-1">
              <span className="text-meta text-ink-3">{chat.questionFreeText}</span>
              <textarea
                value={freeText}
                rows={2}
                disabled={disabled}
                maxLength={2000}
                placeholder={chat.questionFreeTextPlaceholder}
                onChange={(event) => setFreeText(event.target.value)}
                className="w-full resize-none rounded-button border border-border bg-surface px-3 py-2 text-label text-ink outline-none focus:border-brand disabled:opacity-50"
              />
            </label>
          )
        )}

        {!answered && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={disabled || busy || !hasAnything(answers, freeText)}
              onClick={() => void send()}
              className="w-fit rounded-button bg-brand-fill px-3 py-1.5 text-label font-medium text-white hover:bg-brand-fill-strong disabled:opacity-40"
            >
              {chat.questionSend}
            </button>
            {failed && <span role="status" className="text-meta text-danger">{chat.questionSendError}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
