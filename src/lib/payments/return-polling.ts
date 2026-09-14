import type { PaymentReturnState } from "@/lib/payments/return-state";

/**
 * What the return page shows, and how long it keeps asking.
 *
 * The provider's redirect regularly beats its own webhook by a second or two,
 * so the first answer is very often "not yet". The customer must not be asked
 * to refresh for that, and must never be thanked for a payment our own
 * administration has not confirmed. So the page waits: it shows the wordmark
 * and a loader, asks again, and swaps itself for the real message the moment
 * there is one.
 *
 * The rules live here, apart from the component, because they are the part
 * that matters: which states may say thank you (exactly one), and when the
 * asking stops.
 */
export type ReturnView = "loading" | "thanks" | "failed" | "neutral";

/**
 * The one mapping that carries the guarantee: `thanks` is reachable from
 * `paid` and from nothing else. A state that is still open renders the
 * loader, a state that ended badly says so, and anything we cannot vouch for
 * falls back to the message that claims nothing.
 */
export function returnView(state: PaymentReturnState): ReturnView {
  switch (state) {
    case "paid":
      return "thanks";
    case "failed":
      return "failed";
    case "processing":
      return "loading";
    default:
      return "neutral";
  }
}

/** A second, which is about the gap between the redirect and the webhook. */
export const fastPollMs = 1000;
/** After the first half minute a slower beat is enough; nothing is urgent. */
export const slowPollMs = 3000;
const fastWindowMs = 30_000;
/**
 * When to stop asking. Well past any webhook that is coming, and the point
 * where a spinner stops being informative. The page then says the payment is
 * still being processed -- true, and not a request to do anything.
 */
export const pollCeilingMs = 5 * 60_000;

/** Whether another check is worth making, given how long we have been at it. */
export function shouldKeepPolling(state: PaymentReturnState, elapsedMs: number): boolean {
  // Only an unfinished payment is worth asking about again; the other three
  // are final as far as this page is concerned.
  if (state !== "processing") return false;
  return elapsedMs < pollCeilingMs;
}

export function nextPollDelayMs(elapsedMs: number): number {
  return elapsedMs < fastWindowMs ? fastPollMs : slowPollMs;
}

/**
 * What to show once the asking has stopped. Giving up is not a failure and
 * certainly not a success: it is the honest "still being processed".
 */
export function viewAfterPolling(state: PaymentReturnState, elapsedMs: number): ReturnView {
  if (state === "processing" && elapsedMs >= pollCeilingMs) return "neutral";
  return returnView(state);
}
