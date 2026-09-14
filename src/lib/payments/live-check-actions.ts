"use server";

import { requireAdminAccess } from "@/lib/admin/access";
import {
  getCurrentProfile,
  listAllMethods,
  listMethodsForSequence,
  MollieError,
} from "@/lib/mollie/client";
import { getMollieConfig, mollieMode } from "@/lib/mollie/config";
import { summariseLiveCheck, type LiveCheckResult } from "@/lib/payments/live-check";

/**
 * The live Mollie connection, read and nothing else.
 *
 * Four GET requests, and there is no fifth thing it could do: the functions
 * it imports are the read-only half of the client, which fixes the method at
 * GET. It creates no payment, no customer, no mandate, no subscription and no
 * payment link, issues no refund, and writes nothing to the YM database. That
 * is not a promise about behaviour -- it is the only behaviour available to
 * this module.
 *
 *   GET /v2/profiles/me                     which account the key belongs to
 *   GET /v2/methods/all                     activation status per method
 *   GET /v2/methods?sequenceType=first      what can carry the first payment
 *   GET /v2/methods?sequenceType=recurring  what can be collected monthly
 *
 * Two gates in front of it, the same shape as the test-mode check next door:
 * an admin session, and a key that is actually live. On a test key this check
 * would answer about the test account and say nothing about going live, so it
 * refuses rather than reassure about the wrong thing.
 */
export async function runMollieLiveCheck(): Promise<LiveCheckResult> {
  await requireAdminAccess();

  const mode = mollieMode();
  if (mode === "not_configured") {
    return { keyValid: false, reason: "Mollie is niet geconfigureerd. Zet MOLLIE_API_KEY." };
  }
  if (mode === "test") {
    return {
      keyValid: false,
      reason:
        "Er staat een testsleutel ingesteld. Deze controle gaat over de live-koppeling; gebruik hierboven de testcontrole.",
    };
  }

  const config = getMollieConfig();

  try {
    /*
      Independent reads, so they go out together. None of them depends on
      another's answer, and none of them changes anything at the provider.
    */
    const [profile, allMethods, firstMethods, recurringMethods] = await Promise.all([
      getCurrentProfile(config),
      listAllMethods(config),
      listMethodsForSequence("first", config),
      listMethodsForSequence("recurring", config),
    ]);

    return summariseLiveCheck({ profile, allMethods, firstMethods, recurringMethods });
  } catch (error) {
    if (error instanceof MollieError) {
      /*
        401 is the answer worth naming: it means the key itself is not
        accepted, which is a different problem from an account that is not
        ready. Mollie's own message carries the rest; the key never appears
        in one.
      */
      const reason =
        error.status === 401
          ? "Mollie accepteert deze sleutel niet. Controleer MOLLIE_API_KEY."
          : `Mollie weigerde het verzoek (${error.status}): ${error.detail}`;
      return { keyValid: false, reason };
    }
    const reason = error instanceof Error ? error.message : "onbekende fout";
    console.error("Mollie live check failed", { reason });
    return { keyValid: false, reason };
  }
}
