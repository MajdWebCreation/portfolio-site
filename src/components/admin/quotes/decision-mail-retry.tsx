"use client";

import { useState, useTransition } from "react";
import AdminButton from "@/components/admin/admin-button";
import { retryQuoteDecisionMail } from "@/lib/admin/quotes/decision-actions";

/** Sends what did not go out yet after a portal decision -- the customer's confirmation, the internal notice, or both. The decision itself is not touched. */
export default function DecisionMailRetry({ quoteId }: { quoteId: string }) {
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "muted"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <AdminButton
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await retryQuoteDecisionMail(quoteId);
            if (!result.ok) return setMessage({ tone: "danger", text: result.error });
            setMessage(
              result.value === "sent"
                ? { tone: "success", text: "Verstuurd." }
                : { tone: "muted", text: "Was al verstuurd, of wordt op dit moment verstuurd." },
            );
          })
        }
      >
        Opnieuw versturen
      </AdminButton>
      {message ? (
        <span role="status" className={`text-[0.9rem] ${message.tone === "success" ? "text-success" : message.tone === "danger" ? "text-danger" : "text-muted"}`}>
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
