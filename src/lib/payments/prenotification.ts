import { addDays } from "@/lib/admin/documents/validation";
import { billingPeriod, nextPeriodStart, type BillingPeriod } from "@/lib/payments/billing-period";
import { isCollecting, recurringChargeCents, type DebitPrenotification, type RecurringService } from "@/lib/payments/types";

/**
 * When the next direct debit falls, and when the customer has to be told.
 *
 * There is no second calendar here. The collection date is derived from what
 * the system already holds: the service's billing anchor (`starts_on`, fixed
 * when the mandate was given) and the periods already billed, which are the
 * `billing_period_start` values on its invoices. The next collection is the
 * start of the first period that has not been billed yet -- the same date the
 * Mollie subscription was given as its start, arrived at the same way, by
 * `nextPeriodStart` with the anchor day. A service whose anchor is the 31st
 * is therefore announced for 28 February and again for 31 March, because that
 * is what the billing helpers already do.
 */

/** YM Creations announces a collection this many calendar days in advance. */
export const prenotificationDays = 14;

/**
 * Why no collection is expected. These are the cases where the job must stay
 * silent rather than guess, and the last two are data problems an admin
 * should see rather than a quiet skip.
 */
export type NoDebitReason =
  | "not_active"
  | "no_subscription"
  | "missing_anchor";

export type DebitSchedule = {
  /** The day the money is expected to be taken. */
  debitOn: string;
  /** The period that collection pays for. */
  period: BillingPeriod;
  /** The day the customer has to have been told by. */
  announceFrom: string;
};

export type ServiceSchedule = {
  service: Pick<RecurringService, "id" | "customerId" | "name" | "amountCents" | "vatRate" | "status" | "startsOn" | "mollie">;
  /** `billing_period_start` of every invoice that bills this service. */
  billedPeriodStarts: readonly string[];
};

function anchorDayOf(dateKey: string): number {
  return Number(dateKey.slice(8, 10));
}

/**
 * The next expected collection, or the reason there is none.
 *
 * A paused or cancelled service collects nothing. A service without a
 * subscription at the provider collects nothing either, whatever its status
 * says. And a service with no anchor cannot be placed on the calendar at all,
 * which is a data problem, not a date.
 */
export function nextDebitSchedule(input: ServiceSchedule): DebitSchedule | { reason: NoDebitReason } {
  const { service, billedPeriodStarts } = input;

  if (!isCollecting(service)) return { reason: "not_active" };
  if (!service.mollie.subscriptionId) return { reason: "no_subscription" };
  if (!service.startsOn) return { reason: "missing_anchor" };

  const anchorDay = anchorDayOf(service.startsOn);
  // The latest period already billed; before the first charge that is the
  // anchor itself, which the activation invoice covers.
  const latestBilled = [...billedPeriodStarts].sort().at(-1) ?? service.startsOn;
  const debitOn = nextPeriodStart(latestBilled, anchorDay);

  return {
    debitOn,
    period: billingPeriod(debitOn, anchorDay),
    announceFrom: addDays(debitOn, -prenotificationDays),
  };
}

/**
 * Whether today is a day to announce this collection.
 *
 * Not "exactly fourteen days before": from fourteen days before, up to but
 * not including the collection day itself. A run that was missed for a day or
 * two still sends, once, and a collection that has already happened is never
 * announced after the fact.
 */
export function isAnnounceable(schedule: DebitSchedule, todayKey: string): boolean {
  return todayKey >= schedule.announceFrom && todayKey < schedule.debitOn;
}

export type PrenotificationState = "not_needed" | "due" | "sent" | "failed";

/**
 * What the admin sees for one service: whether an announcement is needed yet,
 * and what happened to it. `record` is the stored announcement for exactly
 * this collection -- same period, same date, same amount -- so an amount that
 * changed after an earlier announcement reads as "due" again, which it is.
 */
export function prenotificationState(
  schedule: DebitSchedule,
  todayKey: string,
  record: { status: "pending" | "sent" | "failed" } | undefined,
): PrenotificationState {
  if (record?.status === "sent") return "sent";
  if (record?.status === "failed") return "failed";
  return isAnnounceable(schedule, todayKey) ? "due" : "not_needed";
}

export const prenotificationStateLabels: Record<PrenotificationState, string> = {
  not_needed: "Nog niet nodig",
  due: "Moet verzonden worden",
  sent: "Verzonden",
  failed: "Kon niet worden verzonden",
};

export const prenotificationStateTone: Record<PrenotificationState, "neutral" | "accent" | "success" | "danger"> = {
  not_needed: "neutral",
  due: "accent",
  sent: "success",
  failed: "danger",
};

/**
 * Everything the admin needs to see about one service's next collection.
 *
 * The announcement that counts is the one for *this* collection: same period,
 * same date, same amount. That is also the materiality rule -- if the amount
 * or the date changed after an earlier announcement, no record matches and
 * the state falls back to "due", so the customer gets told about the thing
 * that will actually happen.
 */
export type RecurringOverview = {
  /** Absent when nothing is scheduled; `reason` says why. */
  debitOn?: string;
  announceFrom?: string;
  amountCents?: number;
  reason?: NoDebitReason;
  state: PrenotificationState;
  /** The announcement for exactly this collection, when there is one. */
  record?: DebitPrenotification;
};

export function matchingAnnouncement(
  schedule: DebitSchedule,
  amountCents: number,
  records: readonly DebitPrenotification[],
): DebitPrenotification | undefined {
  return records.find(
    (record) =>
      record.billingPeriodStart === schedule.period.start &&
      record.scheduledDebitOn === schedule.debitOn &&
      record.amountCents === amountCents,
  );
}

export function recurringOverview(
  entry: ServiceSchedule,
  records: readonly DebitPrenotification[],
  todayKey: string,
): RecurringOverview {
  const schedule = nextDebitSchedule(entry);
  if ("reason" in schedule) return { reason: schedule.reason, state: "not_needed" };

  const amountCents = recurringChargeCents(entry.service);
  const forThisService = records.filter((record) => record.recurringServiceId === entry.service.id);
  const record = matchingAnnouncement(schedule, amountCents, forThisService);

  return {
    debitOn: schedule.debitOn,
    announceFrom: schedule.announceFrom,
    amountCents,
    state: prenotificationState(schedule, todayKey, record),
    ...(record ? { record } : {}),
  };
}
