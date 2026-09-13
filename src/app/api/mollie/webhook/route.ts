import { getPayment, listPaymentLinkPayments, MollieError, type MolliePayment } from "@/lib/mollie/client";
import { isMollieConfigured } from "@/lib/mollie/config";
import { toDateKey } from "@/lib/admin/format";
import { rateLimit, requestKey } from "@/lib/payments/rate-limit";
import { createWebhookStore } from "@/lib/payments/webhook-store";
import { processMolliePayment } from "@/lib/payments/webhook";

/**
 * Mollie's webhook.
 *
 * Mollie posts one id: the payment that changed (`tr_...`), or -- depending on
 * which webhook the account has configured -- the payment link it belongs to
 * (`pl_...`). Either is treated as a nudge and nothing more: the actual
 * resources are fetched from Mollie over an authenticated connection, and
 * those -- not the request body -- are what get written. A forged post can
 * therefore at most cause a lookup of an id that does not exist.
 *
 * A payment link carries no metadata, so a link payment arrives with nothing
 * on it that names an invoice. The link's webhook URL therefore names the
 * invoice in its query string, and that hint is verified against Mollie's own
 * list of the link's payments before it routes anything.
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

  const id = await webhookId(request);
  if (!id) return new Response("OK", { status: 200 });

  // A UUID, and only a hint; the store checks it against Mollie before it
  // routes anything.
  const hinted = new URL(request.url).searchParams.get("invoice");
  const fromUrl = hinted && /^[0-9a-f-]{36}$/i.test(hinted) ? hinted : undefined;
  const isLink = id.startsWith("pl_");

  try {
    const store = createWebhookStore();
    const todayKey = toDateKey(new Date());

    /*
      A payment link id resolves to the payments it actually produced, which
      is the documented way to get at the payment and, for a `first` link, the
      mandate it established. Nothing is read off the link object itself.
    */
    const payments: MolliePayment[] = isLink ? await listPaymentLinkPayments(id) : [await getPayment(id)];
    const invoiceId = isLink ? await store.findInvoiceIdForPaymentLink(id) : fromUrl;
    const context = invoiceId ? { invoiceIdHint: invoiceId } : {};

    for (const payment of payments) {
      const outcome = await processMolliePayment(payment, store, todayKey, context);
      // The id is not a secret and the note carries no customer data.
      console.info("Mollie webhook handled", { id, paymentId: payment.id, handled: outcome.handled, note: outcome.note });
    }
    return new Response("OK", { status: 200 });
  } catch (error) {
    /*
      A payment this account cannot see is not ours to handle: that is what a
      test-mode callback looks like to a deployment holding a live key, and
      the other way round. Retrying would never succeed, so it is answered and
      forgotten rather than queued forever.
    */
    if (error instanceof MollieError && error.status === 404) {
      console.info("Mollie webhook for an unknown resource ignored", { id });
      return new Response("OK", { status: 200 });
    }

    console.error("Mollie webhook failed", { id, error });
    // Ask Mollie to try again; the processing is idempotent, so a repeat is safe.
    return new Response("Retry", { status: 500 });
  }
}

/**
 * The id Mollie sent, whatever shape the delivery has: the Payments API posts
 * a form field, and the newer entity webhooks post the entity as JSON. Neither
 * body is trusted beyond the id itself.
 */
async function webhookId(request: Request): Promise<string | undefined> {
  let raw: unknown;
  try {
    const text = await request.text();
    if (!text) return undefined;
    raw = text.trimStart().startsWith("{")
      ? (JSON.parse(text) as unknown)
      : new URLSearchParams(text).get("id");
  } catch {
    return undefined;
  }

  const value =
    typeof raw === "string"
      ? raw
      : typeof raw === "object" && raw !== null && "id" in raw && typeof (raw as { id: unknown }).id === "string"
        ? (raw as { id: string }).id
        : undefined;

  // Not something Mollie would send; nothing to retry.
  return value && /^(tr|pl)_[A-Za-z0-9]+$/.test(value) ? value : undefined;
}
