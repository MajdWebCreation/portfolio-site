"use server";

import { redirect } from "next/navigation";
import { getPortalAccess } from "@/lib/portal/auth";
import { portalLoginPath, portalNoAccessPath } from "@/lib/portal/paths";
import { startInvoicePayment, startMandateActivation, type PortalActionRefusal, type PortalActionResult } from "@/lib/portal/privileged";
import { rateLimit } from "@/lib/payments/rate-limit";
import { PortalDenied } from "@/lib/portal/rpc";

/**
 * The two buttons of the portal that start something at Mollie. Each one
 * resolves who is asking from the session, never from the form; the form
 * carries only which invoice, and that id is proven to be this customer's
 * before anything else happens (lib/portal/privileged.ts). On success the
 * browser goes straight to Mollie; otherwise the button says why, in
 * words a customer can act on, and can be pressed again.
 */
export type PortalPaymentState = { error?: string };

const tooManyAttempts = "U heeft dit net een paar keer geprobeerd. Wacht een minuut en probeer het dan opnieuw.";

const messages: Record<PortalActionRefusal, string> = {
  not_found: "Deze factuur is niet (meer) te betalen vanuit het portaal.",
  nothing_due: "Op deze factuur staat niets meer open.",
  payment_in_progress: "Er loopt al een betaling voor deze factuur. Zodra die is verwerkt, ziet u het resultaat hier; u hoeft niet opnieuw te betalen.",
  direct_debit: "Deze factuur wordt automatisch van uw rekening afgeschreven.",
  unavailable: "Online betalen is op dit moment niet beschikbaar. U kunt betalen per bankoverschrijving, met het kenmerk op de factuur.",
  already_active: "Uw automatische incasso is al actief.",
  awaiting_confirmation: "Uw machtiging is ontvangen en wacht op bevestiging. U hoeft niets opnieuw te doen.",
  processing: "Uw betaling van € 0,01 is ontvangen en wordt nog verwerkt. Kijk over enkele minuten opnieuw.",
  not_needed: "Er is op dit moment geen dienst waarvoor automatische incasso nodig is.",
  failed: "Het lukte nu niet om de betaalpagina te openen. Probeer het over een minuut opnieuw.",
};

async function act(run: (actor: { userId: string; customerId: string }) => Promise<PortalActionResult>, deniedMessage: string): Promise<PortalPaymentState> {
  const access = await getPortalAccess();
  if (access.state === "anonymous") redirect(portalLoginPath);
  if (access.state === "no_membership") redirect(portalNoAccessPath);

  /* Every click costs a request at Mollie; a member gets a handful a minute, which no person needs more of. */
  if (!rateLimit(`portal-payment:${access.member.userId}`, 10, 60).allowed) return { error: tooManyAttempts };

  let result: PortalActionResult;
  try {
    result = await run({ userId: access.member.userId, customerId: access.member.current.customerId });
  } catch (error) {
    if (error instanceof PortalDenied) return { error: deniedMessage };
    console.error("Portal payment action failed", { error: error instanceof Error ? error.message : error });
    return { error: messages.failed };
  }

  if (!result.ok) return { error: messages[result.reason] };
  redirect(result.url);
}

export async function payInvoiceAction(_previous: PortalPaymentState, formData: FormData): Promise<PortalPaymentState> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  return act((actor) => startInvoicePayment(actor, invoiceId), messages.not_found);
}

export async function activateDirectDebitAction(): Promise<PortalPaymentState> {
  return act((actor) => startMandateActivation(actor), "U heeft geen toegang tot dit bedrijf.");
}
