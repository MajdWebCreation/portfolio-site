"use server";

import { requireAdminAccess } from "@/lib/admin/access";
import { createPayment, getPayment, MollieError } from "@/lib/mollie/client";
import { getMollieConfig, integrationCheckRedirectUrl, mollieMode, mollieWebhookUrl } from "@/lib/mollie/config";
import { integrationTestMarker } from "@/lib/payments/webhook";

/**
 * Proving that the Mollie connection works, without touching the books.
 *
 * What this deliberately does NOT do: it creates no invoice, burns no YM-F
 * number, makes no recurring service, writes nothing to the YM database at
 * all, and changes no customer's payment status. It creates one payment at
 * Mollie and reads it back. That is the whole test, because that is the whole
 * question: does the key work and can a payment be made.
 *
 * Two locks stand in front of it:
 *
 *   1. `requireAdminAccess()`, the same gate as every other admin action.
 *   2. the key has to be a `test_` key. A live key means real money and a
 *      real customer ledger at the provider, and no amount of care makes a
 *      payment created there a test. There is no override.
 *
 * The payment it makes carries `integration_test: true`, which the webhook
 * recognises and drops before reading anything, so a callback for it can
 * never become part of the administration.
 */
export type IntegrationCheckResult =
  | {
      ok: true;
      paymentId: string;
      /** The status Mollie reports straight after creating it; "open". */
      status: string;
      amount: string;
      /** Whether Mollie handed back a checkout page, which nobody opens. */
      checkoutAvailable: boolean;
      /** True when reading the payment back also worked. */
      readBack: boolean;
    }
  | { ok: false; reason: string };

/** One cent: the smallest thing Mollie will accept, and it is test money. */
const checkAmountCents = 1;

export async function runMollieIntegrationCheck(): Promise<IntegrationCheckResult> {
  await requireAdminAccess();

  const mode = mollieMode();
  if (mode === "not_configured") {
    return { ok: false, reason: "Mollie is niet geconfigureerd. Zet MOLLIE_API_KEY." };
  }
  if (mode === "live") {
    return {
      ok: false,
      reason:
        "Deze controle draait alleen met een testsleutel. Er staat een live Mollie-key ingesteld, en daarmee zou dit een echte betaling zijn.",
    };
  }

  const config = getMollieConfig();

  try {
    const created = await createPayment({
      amountCents: checkAmountCents,
      description: "YM Creations integratietest (testmodus)",
      redirectUrl: integrationCheckRedirectUrl(config),
      // Pointed at the real webhook on purpose: a callback for this payment is
      // how the ignore path gets exercised in the deployment that made it.
      webhookUrl: mollieWebhookUrl(config),
      // Synthetic only. No customer, no invoice, no service is named here.
      metadata: {
        [integrationTestMarker]: "true",
        kind: "integration_test",
        source: "admin-integration-check",
      },
      sequenceType: "oneoff",
      /*
        Bucketed per minute, so a double click inside the same minute gets the
        payment the first click made instead of a second one.
      */
      idempotencyKey: `integration-check-${new Date().toISOString().slice(0, 16)}`,
      config,
    });

    // Reading it back proves the key works in both directions, which is what
    // the webhook depends on.
    let readBack = false;
    try {
      await getPayment(created.id, config);
      readBack = true;
    } catch {
      readBack = false;
    }

    return {
      ok: true,
      paymentId: created.id,
      status: created.status,
      amount: `${created.amount.currency} ${created.amount.value}`,
      checkoutAvailable: Boolean(created._links?.checkout?.href),
      readBack,
    };
  } catch (error) {
    // Mollie's own message only; the key never appears in one.
    if (error instanceof MollieError) {
      return { ok: false, reason: `Mollie weigerde het verzoek (${error.status}): ${error.detail}` };
    }
    const reason = error instanceof Error ? error.message : "onbekende fout";
    console.error("Mollie integration check failed", { reason });
    return { ok: false, reason };
  }
}
