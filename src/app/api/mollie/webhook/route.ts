import { getPayment, MollieError } from "@/lib/mollie/client";
import { isMollieConfigured } from "@/lib/mollie/config";
import { toDateKey } from "@/lib/admin/format";
import { rateLimit, requestKey } from "@/lib/payments/rate-limit";
import { createWebhookStore } from "@/lib/payments/webhook-store";
import { processMolliePayment } from "@/lib/payments/webhook";

/**
 * Mollie's webhook.
 *
 * Mollie posts one field, the id of a payment that changed. It is treated as
 * a nudge and nothing more: the payment is fetched from Mollie over an
 * authenticated connection, and that resource -- not the request body -- is
 * what gets written. A forged post can therefore at most cause a lookup of an
 * id that does not exist.
 *
 * Status codes matter here. Mollie retries a delivery that does not answer
 * 2xx, so a 200 is returned for anything we have deliberately decided about
 * (including "nothing to do"), and a non-2xx only when a retry could actually
 * help: our own database or Mollie itself being briefly unavailable.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = rateLimit(requestKey(request, "mollie-webhook"), 240, 60);
  if (!limit.allowed) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  if (!isMollieConfigured()) {
    console.error("Mollie webhook received while Mollie is not configured");
    return new Response("Not configured", { status: 503 });
  }

  let paymentId: string;
  try {
    const form = await request.formData();
    const value = form.get("id");
    if (typeof value !== "string" || !/^tr_[A-Za-z0-9]+$/.test(value)) {
      // Not something Mollie would send; nothing to retry.
      return new Response("OK", { status: 200 });
    }
    paymentId = value;
  } catch {
    return new Response("OK", { status: 200 });
  }

  try {
    const payment = await getPayment(paymentId);
    const outcome = await processMolliePayment(payment, createWebhookStore(), toDateKey(new Date()));
    // The id is not a secret and the note carries no customer data.
    console.info("Mollie webhook handled", { paymentId, handled: outcome.handled, note: outcome.note });
    return new Response("OK", { status: 200 });
  } catch (error) {
    /*
      A payment this account cannot see is not ours to handle: that is what a
      test-mode callback looks like to a deployment holding a live key, and
      the other way round. Retrying would never succeed, so it is answered and
      forgotten rather than queued forever.
    */
    if (error instanceof MollieError && error.status === 404) {
      console.info("Mollie webhook for an unknown payment ignored", { paymentId });
      return new Response("OK", { status: 200 });
    }

    console.error("Mollie webhook failed", { paymentId, error });
    // Ask Mollie to try again; the processing is idempotent, so a repeat is safe.
    return new Response("Retry", { status: 500 });
  }
}
