import { describe, expect, it } from "vitest";
import type { PaymentReturnState } from "@/lib/payments/return-state";
import {
  fastPollMs,
  nextPollDelayMs,
  pollCeilingMs,
  returnView,
  shouldKeepPolling,
  slowPollMs,
  viewAfterPolling,
} from "@/lib/payments/return-polling";

/*
  The hard rule of the return page: "Bedankt voor je betaling" appears only
  when our own database calls the invoice paid. Everything else -- the loader,
  the failure message, the neutral fallback -- exists so that rule never has
  to be bent while the webhook catches up.

  These are the rules the component obeys, tested as rules rather than through
  a rendered tree, because this is where the guarantee lives.
*/
const everyState: PaymentReturnState[] = ["paid", "processing", "failed", "unknown"];

describe("which state may thank the customer", () => {
  it("thanks only a settled invoice", () => {
    expect(returnView("paid")).toBe("thanks");

    for (const state of everyState.filter((value) => value !== "paid")) {
      expect(returnView(state)).not.toBe("thanks");
    }
  });

  /* The redirect beating the webhook: a loader, never a message. */
  it("shows the loader while the payment is not settled yet", () => {
    expect(returnView("processing")).toBe("loading");
  });

  it("says a payment ended badly without ever thanking anyone", () => {
    expect(returnView("failed")).toBe("failed");
  });

  /* An invalid, forged or expired token, or a database we cannot reach. */
  it("falls back to the message that claims nothing", () => {
    expect(returnView("unknown")).toBe("neutral");
  });
});

describe("how long the page keeps asking", () => {
  /* Redirect before webhook: it must ask again, unprompted. */
  it("keeps asking while the payment is unsettled", () => {
    expect(shouldKeepPolling("processing", 0)).toBe(true);
    expect(shouldKeepPolling("processing", pollCeilingMs - 1)).toBe(true);
  });

  it("stops the moment there is a final answer", () => {
    for (const state of ["paid", "failed", "unknown"] as const) {
      expect(shouldKeepPolling(state, 0)).toBe(false);
    }
  });

  it("stops after the ceiling rather than spinning for ever", () => {
    expect(shouldKeepPolling("processing", pollCeilingMs)).toBe(false);
  });

  /* About a second, which is the gap between a redirect and a webhook. */
  it("asks about once a second at first, then slows down", () => {
    expect(nextPollDelayMs(0)).toBe(fastPollMs);
    expect(nextPollDelayMs(5_000)).toBe(fastPollMs);
    expect(nextPollDelayMs(60_000)).toBe(slowPollMs);
  });
});

describe("the sequence a waiting customer actually goes through", () => {
  /*
    The whole point of the page, as a walk: the browser arrives first, the
    webhook lands a moment later, and the customer sees the thank-you without
    touching anything.
  */
  it("turns a loader into a thank-you once the invoice is settled", () => {
    let state: PaymentReturnState = "processing";
    let elapsed = 0;

    expect(viewAfterPolling(state, elapsed)).toBe("loading");
    expect(shouldKeepPolling(state, elapsed)).toBe(true);

    // One second later the webhook has been and gone.
    elapsed += nextPollDelayMs(elapsed);
    state = "paid";

    expect(viewAfterPolling(state, elapsed)).toBe("thanks");
    expect(shouldKeepPolling(state, elapsed)).toBe(false);
  });

  /* Already settled when the page loads: the message, no loader at all. */
  it("shows the thank-you immediately when the invoice was already paid", () => {
    expect(viewAfterPolling("paid", 0)).toBe("thanks");
    expect(shouldKeepPolling("paid", 0)).toBe(false);
  });

  it("never turns a cancelled payment into a thank-you", () => {
    let state: PaymentReturnState = "processing";
    expect(viewAfterPolling(state, 0)).toBe("loading");

    state = "failed";
    expect(viewAfterPolling(state, fastPollMs)).toBe("failed");
    expect(shouldKeepPolling(state, fastPollMs)).toBe(false);
  });

  /* An invalid or expired token: one message, immediately, and no asking. */
  it("never thanks anyone on a token it could not verify", () => {
    expect(viewAfterPolling("unknown", 0)).toBe("neutral");
    expect(shouldKeepPolling("unknown", 0)).toBe(false);
  });

  /*
    Giving up is not success and not failure. A customer who waited five
    minutes gets the honest message, not a thank-you and not an alarm.
  */
  it("ends on the neutral message when nothing ever arrived", () => {
    expect(viewAfterPolling("processing", pollCeilingMs)).toBe("neutral");
  });
});
