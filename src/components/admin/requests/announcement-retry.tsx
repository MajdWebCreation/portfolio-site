"use client";

import { useState, useTransition } from "react";
import AdminButton from "@/components/admin/admin-button";
import { retryRequestAnnouncement } from "@/lib/admin/requests/actions";

/** Sends what did not go out yet -- the customer's confirmation, the internal notice, or both -- after a send that failed. */
export default function AnnouncementRetry({ requestId }: { requestId: string }) {
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "muted"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <AdminButton
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await retryRequestAnnouncement(requestId);
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
