import type { Cents } from "@/lib/money";

/**
 * The reminder ladder, in one place.
 *
 * Every day, every amount and every word of warning that the automation uses
 * is a value here. Changing when a customer is chased, or dropping the fee
 * warning entirely, is an edit to this file and to nothing else.
 */
export type ReminderStage = "first_reminder" | "second_reminder" | "final_notice";

export type ReminderStep = {
  stage: ReminderStage;
  /** Days past the invoice's own due date before this step may go out. */
  daysOverdue: number;
};

/**
 * Counted from the due date the invoice already carries -- fourteen calendar
 * days after the invoice date, from the general terms. The ladder does not
 * set payment terms; it reacts to the one the document states.
 */
export const reminderSteps: readonly ReminderStep[] = [
  { stage: "first_reminder", daysOverdue: 1 },
  { stage: "second_reminder", daysOverdue: 7 },
  { stage: "final_notice", daysOverdue: 14 },
];

export const reminderStageLabels: Record<ReminderStage, string> = {
  first_reminder: "Eerste betalingsherinnering",
  second_reminder: "Tweede betalingsherinnering",
  final_notice: "Laatste aanmaning",
};

/** The final notice gives this many calendar days to put it right. */
export const finalNoticeGraceDays = 7;

/**
 * When an invoice is considered ready to be handed over -- day 14 plus the
 * grace the final notice promised. Nothing happens automatically on this day:
 * it is where the automation stops and a person takes over.
 */
export const collectionReadyDays = reminderSteps[2].daysOverdue + finalNoticeGraceDays;

/**
 * An invoice collected by direct debit is not chased while the collection is
 * still on its way. A SEPA charge takes days to report, so a reminder on day
 * one would be chasing a customer whose money is already moving.
 *
 * The wait ends as soon as a failure is on record, and in any case after this
 * many days: a subscription that never charged at all is a problem the
 * customer should still hear about, just not on day one.
 */
export const directDebitGraceDays = 5;

/*
  ---------------------------------------------------------------------------
  The EUR 20, and the line it may not cross.
  ---------------------------------------------------------------------------

  The general terms in force -- Algemene Voorwaarden B2B - 2026, at
  /nl/algemene-voorwaarden -- do provide for this amount. Article 9.10 lets YM
  charge EUR 20,00 per outstanding invoice for further payment follow-up, and
  articles 9.9 to 9.13 say under which conditions. Three of those conditions
  decide what this code may do:

    9.9   YM sends one or more reminders free of charge first.
    9.10  The amount is not owed by the due date passing. It becomes owed only
          at the moment YM expressly charges it in writing, naming the amount.
    9.12  It is a first, partial instalment of the one claim for out-of-court
          recovery costs -- not an extra on top -- and is deducted in full from
          any later claim for those costs.

  So the terms allow the charge; this code does not make it. Charging is a
  deliberate act by a person against one invoice, and 9.10 requires exactly
  that. The automation only *announces* the possibility, in one sentence of
  the second reminder, and nowhere else:

    - the amount is never added to an invoice, its lines or its total;
    - it is never added to the outstanding balance or to customer financials;
    - no payment, debt or ledger record of it is ever created;
    - the payment button collects the invoice's own outstanding amount and
      nothing more;
    - the mail never calls it statutory collection costs, because on its own
      it is not: under 9.12 it is a part of that claim, deducted from it.

  Nothing in the database can hold it: there is no column for an amount
  anywhere in the collection tables. That is on purpose -- the guarantee is
  structural, not a promise in a comment. Should YM ever want to charge it for
  real, that is a new flow with its own record of what was charged and when,
  and the deduction of 9.12 has to be part of it.

  To stop announcing it, set `reminderFeeAnnounced` to false; the sentence
  disappears from the mail and nothing else changes. To change the amount,
  change `reminderFeeCents` here and article 9.10 there -- the two are one
  figure. Both values are read in exactly one place: the second reminder's
  body.
*/

/**
 * Whether the second reminder mentions the amount at all.
 *
 * May stay on for as long as that mail only warns and the figure is booked
 * nowhere. The moment this code starts actually charging, this flag is no
 * longer the thing that decides -- the charge is.
 */
export const reminderFeeAnnounced = true;

/**
 * EUR 20,00, the figure article 9.10 of the general terms names.
 *
 * Announced as a possibility on day 7; never charged, invoiced or booked by
 * this code.
 */
export const reminderFeeCents: Cents = 2000;
