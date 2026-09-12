"use server";

import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/payments/rate-limit";
import { startActivation } from "@/lib/payments/recurring";

/**
 * Starting direct debit, as a POST and only as a POST.
 *
 * A server action is a POST by construction, which is the point: nothing
 * financial may happen because a link was followed. A mail client prefetching
 * the page, a scanner, a bot -- all of those do GET, and none of them reaches
 * this.
 *
 * Idempotency lives in `startActivation`: a second POST resumes the payment
 * the first one created rather than making another.
 */
const problems = {
  unknown: "onbekend",
  expired: "verlopen",
  used: "gebruikt",
  unavailable: "niet-beschikbaar",
} as const;

export async function beginDirectDebit(formData: FormData): Promise<void> {
  const token = formData.get("token");
  const locale = formData.get("locale");
  const path = `/${locale === "en" ? "en" : "nl"}/betaling/incasso-afgerond`;

  if (typeof token !== "string") redirect(`${path}?status=${problems.unknown}`);

  // Keyed on the token rather than the address: the thing being protected is
  // one activation, and a shared office address must not lock a customer out.
  const limit = rateLimit(`incasso-post:${token}`, 6, 60);
  if (!limit.allowed) redirect(`${path}?status=${problems.unavailable}`);

  let target: string;
  try {
    const outcome = await startActivation(token);
    if (!outcome.ok) redirect(`${path}?status=${problems[outcome.reason]}`);
    target = outcome.checkoutUrl;
  } catch (error) {
    // A failure must not say which token was tried.
    console.error("Starting direct debit failed", { error });
    redirect(`${path}?status=${problems.unavailable}`);
  }

  redirect(target);
}
