// Cartes de questions (`ask_user`) côté navigateur — le miroir de `backend/app/chat/src/questions.py`.
//
// Le serveur fait autorité sur TOUT : il normalise la carte, valide les réponses contre les options
// réellement proposées, et compose le texte du message. Ce qui vit ici est volontairement mince :
//
//   - `cardOf` relit la carte enregistrée (y compris l'ancienne forme à une seule question, qui
//     existe déjà en base) pour la dessiner ;
//   - `answerPreview` écrit le texte de la bulle OPTIMISTE, celle qu'on voit pendant que la requête
//     part. Le serveur renvoie ensuite le texte qu'il a réellement enregistré (événement SSE
//     `user_message`) et il REMPLACE celui-ci — ce fichier ne peut donc pas faire diverger
//     durablement l'écran de la base, même si la composition changeait d'un côté seulement.

import type { ToolCall } from "./workspace-types";

export type QuestionType = "yes_no" | "single" | "multi";

export type Question = {
  id: string;
  question: string;
  type: QuestionType;
  /** Vide pour `yes_no` : les libellés Oui/Non appartiennent à l'interface, pas à la carte. */
  options: string[];
};

export type QuestionCard = { questions: Question[]; allowFreeText: boolean };

/** Valeurs enregistrées d'une question oui/non — jamais « Oui »/« Non » : une réponse enregistrée
 * doit rester lisible quand l'utilisateur change la langue de l'interface. */
export const YES = "yes";
export const NO = "no";

/** Réponses cochées : {identifiant de question → choix}. */
export type Answers = Record<string, string[]>;

const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const asOptions = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(asString).filter(Boolean) : [];

const TYPES: QuestionType[] = ["yes_no", "single", "multi"];
const asType = (value: unknown, options: string[]): QuestionType => {
  const asked = asString(value) as QuestionType;
  if (TYPES.includes(asked)) return asked !== "yes_no" && !options.length ? "yes_no" : asked;
  return options.length ? "single" : "yes_no";
};

/**
 * La carte portée par un appel `ask_user`, ou `null` s'il n'y a rien à dessiner.
 * Accepte les deux formes enregistrées : `questions: [...]` et l'ancienne `question` + `options`.
 */
export function cardOf(call: ToolCall | undefined): QuestionCard | null {
  if (!call || call.name !== "ask_user") return null;
  const raw = call.arguments.questions;
  const entries: Record<string, unknown>[] = Array.isArray(raw) && raw.length
    ? (raw.filter((item) => item && typeof item === "object") as Record<string, unknown>[])
    : [{ question: call.arguments.question, options: call.arguments.options }];

  const questions: Question[] = [];
  for (const entry of entries) {
    const text = asString(entry.question).trim();
    if (!text) continue;
    const options = asOptions(entry.options);
    const type = asType(entry.type, options);
    questions.push({
      // Le serveur attribue `q1`, `q2`… ; une carte de l'ancienne forme n'en a pas, on retrouve la
      // même numérotation — c'est la clé sous laquelle les réponses sont validées et enregistrées.
      id: asString(entry.id) || `q${questions.length + 1}`,
      question: text,
      type,
      options: type === "yes_no" ? [] : options,
    });
  }
  if (!questions.length) return null;
  return { questions, allowFreeText: call.arguments.allow_free_text !== false };
}

/** Une carte à laquelle il reste quelque chose à répondre est-elle complète ? Sert au bouton d'envoi :
 * une carte n'oblige à rien, une seule réponse (ou une précision) suffit. */
export const hasAnything = (answers: Answers, freeText: string): boolean =>
  freeText.trim().length > 0 || Object.values(answers).some((picked) => picked.length > 0);

/**
 * Le texte de la bulle optimiste. Même forme que `compose_answer_text` côté serveur, qui reste le
 * seul à écrire ce qui est enregistré (voir l'en-tête de ce fichier).
 */
export function answerPreview(
  card: QuestionCard,
  answers: Answers,
  freeText: string,
  labels: { yes: string; no: string; note: string },
): string {
  const lines: string[] = [];
  for (const question of card.questions) {
    const picked = answers[question.id];
    if (!picked?.length) continue;
    const shown = question.type === "yes_no" ? picked.map((v) => (v === YES ? labels.yes : labels.no)) : picked;
    lines.push(`${question.question} → ${shown.join(", ")}`);
  }
  const note = freeText.trim();
  if (note) lines.push(`${labels.note} : ${note}`);
  return lines.join("\n");
}
