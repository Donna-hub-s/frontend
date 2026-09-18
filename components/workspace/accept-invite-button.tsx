"use client";

import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/app/[lang]/dictionaries";

export function AcceptInviteButton({ lang, token, labels }: { lang: Locale; token: string; labels: Dictionary["invite"] }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const accept = async () => {
    setState("busy");
    const response = await fetch("/api/donna/chat/projects/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    setState(response?.ok ? "done" : "error");
  };

  if (state === "done") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-message text-success-ink">{labels.accepted}</p>
        <Link
          href={`/${lang}/app`}
          className="inline-flex h-11 items-center justify-center rounded-button bg-bordeaux-700 px-5 text-label font-medium text-white no-underline hover:bg-bordeaux-900"
        >
          {labels.goToApp}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={state === "busy"}
        onClick={() => void accept()}
        className="inline-flex h-11 w-full items-center justify-center rounded-button bg-bordeaux-700 px-5 text-label font-medium text-white hover:bg-bordeaux-900 disabled:opacity-60"
      >
        {state === "busy" ? labels.accepting : labels.accept}
      </button>
      {state === "error" && <p className="text-secondary text-danger">{labels.acceptError}</p>}
    </div>
  );
}
