import { companyProfile } from "@/lib/admin/documents/company";
import type { MollieMethod, MollieMethodStatus, MollieProfile } from "@/lib/mollie/client";

/**
 * Reading the live Mollie connection, without touching it.
 *
 * The question this answers is the one to ask before the first real invoice
 * goes out: does the live key work, is it the right account, and can the two
 * things this integration depends on actually happen -- a customer paying an
 * invoice, and a monthly amount being collected by direct debit afterwards.
 *
 * The summarising is here, apart from the requests, so the judgement can be
 * tested against every shape Mollie can return without a network. What counts
 * as a blocker is a decision, not a fetch.
 *
 * Nothing identifying comes out of this module. The profile id (`pfl_…`), the
 * key and every other credential stay on the server; the admin sees a name
 * and some yes/no.
 */
export type MethodAvailability = {
  /** Mollie's own word, or "unavailable" when it does not offer the method. */
  status: MollieMethodStatus | "unavailable";
  /** Activated for this profile. */
  activated: boolean;
  /**
   * Usable for the sequence this integration needs it for: a first payment
   * for iDEAL, a recurring collection for SEPA Direct Debit. Activation and
   * usability are different questions and Mollie answers them separately.
   */
  usable: boolean;
};

export type LiveCheckSummary = {
  /** The key authenticated; Mollie answered as somebody. */
  keyValid: true;
  profileName: string;
  /** Whether that name is the YM Creations profile we expect to be billing as. */
  profileMatchesCompany: boolean;
  /** Mollie's verification state for the profile. */
  profileStatus: MollieProfile["status"];
  /** Set while Mollie is reviewing a change to the profile. */
  profileReview?: "pending" | "rejected";
  /** "live" here; a test key never reaches this check. */
  mode: MollieProfile["mode"];
  ideal: MethodAvailability;
  directDebit: MethodAvailability;
  /** Everything that stands between this account and a real payment. */
  blockers: string[];
};

export type LiveCheckResult = LiveCheckSummary | { keyValid: false; reason: string };

/** Mollie's own method identifiers; see docs.mollie.com/reference/list-all-methods. */
export const idealMethodId = "ideal";
export const directDebitMethodId = "directdebit";

function availability(
  methodId: string,
  all: readonly MollieMethod[],
  usableForSequence: readonly MollieMethod[],
): MethodAvailability {
  const offered = all.find((method) => method.id === methodId);
  const status = offered?.status ?? (offered ? "activated" : "unavailable");
  return {
    status,
    activated: status === "activated",
    usable: usableForSequence.some((method) => method.id === methodId),
  };
}

/** Names differ in spacing and case long before they differ in meaning. */
function sameName(a: string, b: string): boolean {
  const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-NL");
  return normalise(a) === normalise(b);
}

const methodLabels: Record<string, string> = {
  [idealMethodId]: "iDEAL",
  [directDebitMethodId]: "SEPA Incasso",
};

/*
  Why a method is not ready, in the admin's language. Mollie's statuses say
  what has to happen next, and that is more useful than "unavailable".
*/
function methodBlocker(methodId: string, state: MethodAvailability, sequence: string): string | undefined {
  const label = methodLabels[methodId] ?? methodId;

  if (state.status === "unavailable") return `${label} wordt niet aangeboden voor dit Mollie-profiel.`;
  if (state.status === "pending-boarding") {
    return `${label} is nog niet afgerond: Mollie wacht op gegevens in het dashboard.`;
  }
  if (state.status === "pending-review") return `${label} wacht op goedkeuring door Mollie.`;
  if (state.status === "pending-external") return `${label} wacht op een externe partij.`;
  if (state.status === "rejected") return `${label} is door Mollie afgewezen.`;
  if (!state.usable) return `${label} is geactiveerd, maar niet beschikbaar voor ${sequence}.`;
  return undefined;
}

export function summariseLiveCheck(input: {
  profile: MollieProfile;
  allMethods: readonly MollieMethod[];
  /** Methods usable for the payment that also establishes a mandate. */
  firstMethods: readonly MollieMethod[];
  /** Methods usable for the monthly collection that follows it. */
  recurringMethods: readonly MollieMethod[];
}): LiveCheckSummary {
  const { profile, allMethods, firstMethods, recurringMethods } = input;

  const ideal = availability(idealMethodId, allMethods, firstMethods);
  const directDebit = availability(directDebitMethodId, allMethods, recurringMethods);
  const profileMatchesCompany = sameName(profile.name, companyProfile.name);

  const blockers: string[] = [];

  /*
    The wrong account is the worst outcome of the three, because everything
    else would look like it worked: real invoices would be paid into somebody
    else's Mollie profile.
  */
  if (!profileMatchesCompany) {
    blockers.push(`Het profiel heet "${profile.name}" en niet "${companyProfile.name}". Controleer welke sleutel is ingesteld.`);
  }
  if (profile.mode !== "live") blockers.push("Dit is geen live profiel.");
  if (profile.status === "blocked") blockers.push("Dit Mollie-profiel is geblokkeerd; er kan niet mee worden geïncasseerd.");
  if (profile.status === "unverified") {
    blockers.push("Dit Mollie-profiel is nog niet geverifieerd. Zolang dat zo is worden uitbetalingen tegengehouden.");
  }
  if (profile.review?.status === "rejected") blockers.push("Mollie heeft een wijziging op dit profiel afgewezen.");

  const idealBlocker = methodBlocker(idealMethodId, ideal, "de eerste betaling");
  if (idealBlocker) blockers.push(idealBlocker);

  const debitBlocker = methodBlocker(directDebitMethodId, directDebit, "automatische incasso");
  if (debitBlocker) blockers.push(debitBlocker);

  return {
    keyValid: true,
    profileName: profile.name,
    profileMatchesCompany,
    profileStatus: profile.status,
    ...(profile.review?.status ? { profileReview: profile.review.status } : {}),
    mode: profile.mode,
    ideal,
    directDebit,
    blockers,
  };
}

/** True when nothing stands between this account and a real payment. */
export function liveCheckReady(result: LiveCheckResult): boolean {
  return result.keyValid && result.blockers.length === 0;
}
