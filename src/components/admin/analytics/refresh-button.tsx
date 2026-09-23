"use client";

import { useActionState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { refreshAnalyticsAction, type RefreshState } from "@/lib/admin/analytics/actions";

/**
 * "Vernieuw nu" and what came of it. The action is the cron's own run; the
 * message says which mode it ran in, because a dry run looks like nothing
 * happened on the page and the admin should know why.
 */
function describe(state: RefreshState): string | null {
  switch (state.status) {
    case "idle":
      return null;
    case "limited":
      return `Net al vernieuwd. Probeer het over ${Math.ceil(state.retryAfterSeconds / 60)} minuten opnieuw.`;
    case "not_configured":
      return `GA4 is niet gekoppeld: ${state.missing.join(", ")} ontbreekt.`;
    case "done":
      return state.mode === "applied"
        ? `Bijgewerkt: ${state.rows} rijen.${state.failed.length > 0 ? ` Mislukt: ${state.failed.join("; ")}.` : ""}`
        : `Proefrun (ANALYTICS_SYNC_ENABLED staat niet op "true"): ${state.rows} rijen opgehaald, niets opgeslagen.${
            state.failed.length > 0 ? ` Mislukt: ${state.failed.join("; ")}.` : ""
          }`;
  }
}

export default function RefreshButton({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState<RefreshState>(refreshAnalyticsAction, { status: "idle" });
  const message = describe(state);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <AdminButton type="submit" variant="secondary" disabled={pending || disabled}>
        {pending ? "Bezig…" : "Vernieuw nu"}
      </AdminButton>
      {message ? (
        <p className="text-[0.85rem] text-muted" aria-live="polite">
          {message}
        </p>
      ) : null}
    </form>
  );
}
