"use client";

import { useActionState } from "react";
import { activateDirectDebitAction, payInvoiceAction, type PortalPaymentState } from "@/lib/portal/payment-actions";

/**
 * The portal's two payment buttons. A form post each, so they work without
 * JavaScript; with it, the button locks while the server prepares the
 * payment page -- one click, one request -- and a refusal or a failure is
 * shown beside it with the button ready for another try.
 */
const initial: PortalPaymentState = {};

function Feedback({ state }: { state: PortalPaymentState }) {
  return (
    <p role="status" aria-live="polite" className={`mt-3 max-w-prose text-[0.9rem] ${state.error ? "text-danger" : "sr-only"}`}>
      {state.error ?? ""}
    </p>
  );
}

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-sm bg-ink px-5 text-[0.95rem] font-medium text-paper transition-opacity disabled:cursor-wait disabled:opacity-60";

export function PayInvoiceButton({ invoiceId, label }: { invoiceId: string; label: string }) {
  const [state, action, pending] = useActionState(payInvoiceAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button type="submit" disabled={pending} aria-disabled={pending} className={buttonClass}>
        {pending ? "Betaalpagina wordt geopend…" : label}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ActivateDirectDebitButton() {
  const [state, action, pending] = useActionState(activateDirectDebitAction, initial);
  return (
    <form action={action}>
      <button type="submit" disabled={pending} aria-disabled={pending} className={buttonClass}>
        {pending ? "Machtigingspagina wordt geopend…" : "Automatische incasso activeren"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
