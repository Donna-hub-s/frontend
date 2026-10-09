"use client";

import { useState } from "react";
import { nextFeedback, REASON_MAX, sendFeedback, type Feedback } from "@/lib/feedback";
import { ThumbDownIcon, ThumbUpIcon } from "./icons";

export type FeedbackLabels = {
  feedbackGood: string;
  feedbackBad: string;
  feedbackReasonLabel: string;
  feedbackReasonPlaceholder: string;
  feedbackSend: string;
  feedbackSkip: string;
  feedbackThanks: string;
  feedbackError: string;
};

/** Pouces sous une réponse de DONNA. Le retour est enregistré tout de suite ; « pas bonne » propose, sans l'exiger, de dire pourquoi. */
export function FeedbackBar({
  messageId,
  value,
  labels,
  onChange,
}: {
  messageId: string;
  value: Feedback | null | undefined;
  labels: FeedbackLabels;
  onChange: (value: Feedback | null) => void;
}) {
  const [status, setStatus] = useState<"idle" | "reason" | "thanks" | "error">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const choose = async (clicked: Feedback) => {
    if (busy) return;
    const previous = value ?? null;
    const next = nextFeedback(previous, clicked);
    onChange(next);
    setBusy(true);
    const saved = await sendFeedback(messageId, next);
    setBusy(false);
    if (!saved) {
      onChange(previous);
      setStatus("error");
      return;
    }
    setStatus(next === "down" ? "reason" : "idle");
  };

  const sendReason = async () => {
    if (busy) return;
    setBusy(true);
    const saved = await sendFeedback(messageId, "down", reason);
    setBusy(false);
    setStatus(saved ? "thanks" : "error");
  };

  const thumb = (kind: Feedback, label: string, Icon: typeof ThumbUpIcon) => (
    <button
      type="button"
      aria-pressed={value === kind}
      aria-label={label}
      title={label}
      onClick={() => void choose(kind)}
      className={`flex size-6 items-center justify-center rounded-full hover:bg-active hover:text-ink ${value === kind ? "bg-active text-brand" : "text-ink-3"}`}
    >
      <Icon size={14} />
    </button>
  );

  // Fragment : les pouces se rangent dans la ligne de pied du message (heure, écoute) ; le formulaire passe en dessous
  // (`basis-full` dans un parent `flex-wrap`).
  return (
    <>
      <div className="flex items-center gap-1">
        {thumb("up", labels.feedbackGood, ThumbUpIcon)}
        {thumb("down", labels.feedbackBad, ThumbDownIcon)}
        <span role="status" className={`ml-1 text-meta ${status === "error" ? "text-danger" : "text-ink-3"}`}>
          {status === "thanks" ? labels.feedbackThanks : status === "error" ? labels.feedbackError : ""}
        </span>
      </div>
      {status === "reason" && value === "down" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void sendReason();
          }}
          className="flex w-full max-w-md basis-full flex-col gap-2 rounded-card border border-border bg-surface p-3"
        >
          <label htmlFor={`reason-${messageId}`} className="text-secondary text-ink-2">
            {labels.feedbackReasonLabel}
          </label>
          <textarea
            id={`reason-${messageId}`}
            value={reason}
            maxLength={REASON_MAX}
            rows={2}
            onChange={(event) => setReason(event.target.value)}
            placeholder={labels.feedbackReasonPlaceholder}
            className="resize-none rounded-badge border border-border px-2.5 py-1.5 text-label text-ink outline-none focus:border-brand"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setStatus("idle")} className="rounded-button px-3 py-1.5 text-label text-ink-2 hover:bg-active">
              {labels.feedbackSkip}
            </button>
            <button type="submit" disabled={busy || !reason.trim()} className="rounded-button bg-brand-fill px-3 py-1.5 text-label font-medium text-white hover:bg-brand-fill-strong disabled:opacity-50">
              {labels.feedbackSend}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
