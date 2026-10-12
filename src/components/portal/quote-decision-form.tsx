"use client";

import { useActionState, useState } from "react";
import { decideQuoteAction, type DecideQuoteState } from "@/lib/portal/quotes/actions";
import { decisionTextMax } from "@/lib/quotes/decision";

/**
 * Accepting or rejecting an open quote. Both are form posts, so nothing is
 * decided by opening a page or following a link. Accepting needs the box
 * ticked -- never ticked in advance -- and rejecting needs a second, explicit
 * button after the optional reason. After a decision the server re-renders
 * the page from the record, and this block is gone for good.
 *
 * The form carries the hash of the document the page showed; the server
 * refuses a decision on any other.
 */
const initial: DecideQuoteState = { status: "idle" };

const primary =
  "inline-flex min-h-11 items-center justify-center rounded-sm bg-ink px-5 text-[0.95rem] font-medium text-paper transition-opacity disabled:cursor-wait disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-sm border border-line px-5 text-[0.95rem] text-ink transition-colors hover:border-ink disabled:cursor-wait disabled:opacity-60";

type Props = { customerId: string; quoteId: string; documentSha256: string };

function Hidden({ customerId, quoteId, documentSha256, decision }: Props & { decision: "accepted" | "rejected" }) {
  return (
    <>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="documentSha256" value={documentSha256} />
      <input type="hidden" name="decision" value={decision} />
    </>
  );
}

function Outcome({ state }: { state: DecideQuoteState }) {
  if (state.status === "refused" || state.status === "stale_customer" || state.status === "error") {
    return (
      <div role="alert" className="mt-4 max-w-prose border-l-2 border-danger pl-4 text-[0.92rem] text-body">
        <p>{state.message}</p>
        {state.status !== "error" ? (
          <button type="button" onClick={() => window.location.reload()} className="link-static mt-2 text-ink">
            Pagina opnieuw laden
          </button>
        ) : null}
      </div>
    );
  }
  if (state.status === "decided") {
    return (
      <p role="status" className="mt-4 text-[0.92rem] text-success">
        {state.decision === "accepted" ? "Offerte geaccepteerd." : "Offerte afgewezen."}
      </p>
    );
  }
  return null;
}

export default function QuoteDecisionForm(props: Props) {
  const [acceptState, accept, accepting] = useActionState(decideQuoteAction, initial);
  const [rejectState, reject, rejecting] = useActionState(decideQuoteAction, initial);
  const [confirmed, setConfirmed] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const pending = accepting || rejecting;
  const done = acceptState.status === "decided" || rejectState.status === "decided";

  const confirmationError = acceptState.status === "invalid" && acceptState.field === "confirmation" ? acceptState.message : null;
  const reasonError = rejectState.status === "invalid" && rejectState.field === "rejectionReason" ? rejectState.message : null;

  return (
    <div>
      <form action={accept} className="space-y-4">
        <Hidden {...props} decision="accepted" />
        <label className="flex max-w-prose items-start gap-3 text-[0.95rem] text-ink">
          <input
            type="checkbox"
            name="confirmTerms"
            required
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={pending || done}
            aria-invalid={confirmationError ? true : undefined}
            aria-describedby={confirmationError ? "quote-confirm-error" : undefined}
            className="mt-1 size-4 shrink-0"
          />
          <span>Ik heb de offerte en bijbehorende voorwaarden gelezen en ga hiermee akkoord.</span>
        </label>
        {confirmationError ? (
          <p id="quote-confirm-error" className="text-[0.85rem] text-danger">
            {confirmationError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending || done} className={primary}>
            {accepting ? "Bezig…" : "Offerte accepteren"}
          </button>
          {!rejectOpen ? (
            <button type="button" disabled={pending || done} onClick={() => setRejectOpen(true)} className={secondary}>
              Offerte afwijzen
            </button>
          ) : null}
        </div>
        <Outcome state={acceptState} />
      </form>

      {rejectOpen ? (
        <form action={reject} className="mt-8 max-w-prose space-y-4 border-t border-line pt-6">
          <Hidden {...props} decision="rejected" />
          <div>
            <label htmlFor="quote-reject-reason" className="block text-[0.95rem] text-ink">
              Wilt u toelichten waarom u de offerte afwijst? <span className="text-muted">Dit is optioneel.</span>
            </label>
            <textarea
              id="quote-reject-reason"
              name="rejectionReason"
              maxLength={decisionTextMax}
              disabled={pending || done}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? "quote-reject-error" : undefined}
              className={`mt-1.5 min-h-28 w-full rounded-sm border bg-surface px-3 py-2 text-[0.95rem] leading-relaxed text-ink outline-none focus:border-ink ${reasonError ? "border-danger" : "border-line"}`}
            />
            {reasonError ? (
              <p id="quote-reject-error" className="mt-1.5 text-[0.85rem] text-danger">
                {reasonError}
              </p>
            ) : null}
          </div>
          <p className="text-[0.88rem] text-muted">Een afwijzing is definitief. De offerte kan daarna niet meer worden geaccepteerd.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending || done} className={primary}>
              {rejecting ? "Bezig…" : "Offerte definitief afwijzen"}
            </button>
            <button type="button" disabled={pending || done} onClick={() => setRejectOpen(false)} className={secondary}>
              Annuleren
            </button>
          </div>
          <Outcome state={rejectState} />
        </form>
      ) : null}
    </div>
  );
}
