import {
  isInquiryStatus,
  isLostReason,
  isServiceKey,
  type InquiryStatus,
  type LostReason,
} from "@/lib/admin/inquiries/types";
import type { ServiceKey } from "@/lib/content/services";

/**
 * What the pipeline panel sends, and what may be written. Pure, so the rules
 * are testable without a database and the same on the server action and in
 * any later caller.
 *
 *  - the status must be one of the six stages;
 *  - lost needs a reason, any other status has none;
 *  - the values are whole, non-negative cents (EUR excluding VAT) and are
 *    kept whatever the status: they are the current business values, and a
 *    value entered at quote_sent is still the current quoted value after the
 *    deal is won;
 *  - the service, when given, is one the site knows.
 */
export type InquiryHandlingInput = {
  status: string;
  lostReason?: string;
  serviceInterest?: string;
  quotedValueCents?: number | null;
  wonValueCents?: number | null;
  recurringMonthlyCents?: number | null;
  internalNote: string;
};

export type InquiryHandling = {
  status: InquiryStatus;
  lostReason?: LostReason;
  serviceInterest?: ServiceKey;
  quotedValueCents?: number;
  wonValueCents?: number;
  recurringMonthlyCents?: number;
  internalNote: string;
};

type Checked = { ok: true; value: InquiryHandling } | { ok: false; error: string };

function centsField(value: number | null | undefined, label: string): { ok: true; value?: number } | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true };
  if (!Number.isInteger(value) || value < 0) return { ok: false, error: `${label}: vul een bedrag van nul of hoger in.` };
  return { ok: true, value };
}

export function validateInquiryHandling(input: InquiryHandlingInput): Checked {
  if (!isInquiryStatus(input.status)) return { ok: false, error: "Onbekende status." };
  const status = input.status;

  let lostReason: LostReason | undefined;
  if (status === "lost") {
    if (!input.lostReason || !isLostReason(input.lostReason)) return { ok: false, error: "Kies een reden waarom deze aanvraag verloren is." };
    lostReason = input.lostReason;
  } else if (input.lostReason) {
    return { ok: false, error: "Een reden hoort alleen bij de status Verloren." };
  }

  let serviceInterest: ServiceKey | undefined;
  if (input.serviceInterest) {
    if (!isServiceKey(input.serviceInterest)) return { ok: false, error: "Onbekende dienst." };
    serviceInterest = input.serviceInterest;
  }

  const quoted = centsField(input.quotedValueCents, "Offertewaarde");
  if (!quoted.ok) return quoted;
  const won = centsField(input.wonValueCents, "Eenmalige waarde");
  if (!won.ok) return won;
  const recurring = centsField(input.recurringMonthlyCents, "Maandelijkse waarde");
  if (!recurring.ok) return recurring;

  return {
    ok: true,
    value: {
      status,
      ...(lostReason ? { lostReason } : {}),
      ...(serviceInterest ? { serviceInterest } : {}),
      ...(quoted.value !== undefined ? { quotedValueCents: quoted.value } : {}),
      ...(won.value !== undefined ? { wonValueCents: won.value } : {}),
      ...(recurring.value !== undefined ? { recurringMonthlyCents: recurring.value } : {}),
      internalNote: input.internalNote,
    },
  };
}
