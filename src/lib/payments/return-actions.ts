"use server";

import { rateLimit } from "@/lib/payments/rate-limit";
import { readPaymentReturnState } from "@/lib/payments/return-lookup";
import type { PaymentReturnState } from "@/lib/payments/return-state";

/**
 * The status check the return page repeats while it waits.
 *
 * It answers with one of four words and nothing else -- no invoice, no
 * number, no amount, no customer, not even a reason for a refusal. That is
 * the whole contract: the page needs to know whether it may say thank you
 * yet, and nothing more would be safe to hand a browser.
 *
 * The token is the one the URL already carries, verified on every call by
 * `readPaymentReturnState` before any identifier exists to look up. A caller
 * without a valid token therefore causes no database work, whatever they
 * send and however often.
 */
const pollsPerMinute = 120;

export async function checkPaymentReturnState(token: string | undefined): Promise<PaymentReturnState> {
  if (!token) return "unknown";

  /*
    A public endpoint on a one-second loop deserves a ceiling. Generous enough
    that the page's own polling never reaches it, keyed on the token so one
    visitor cannot spend another's budget. Exceeding it answers "processing":
    a limiter must not be able to turn a real payment into bad news.

    The key is the head of the token, which is the random IV -- long enough to
    be unique in practice, short enough not to fill the window map.
  */
  const limit = rateLimit(`payment-return:${token.slice(0, 64)}`, pollsPerMinute, 60);
  if (!limit.allowed) return "processing";

  return readPaymentReturnState(token);
}
