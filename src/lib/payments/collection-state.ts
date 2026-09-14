import type { StatusTone } from "@/components/admin/status-badge";
import { addDays, daysBetween } from "@/lib/admin/documents/validation";
import type { Invoice } from "@/lib/admin/invoices/types";
import { calculateTotals, type Cents } from "@/lib/money";
import {
  collectionReadyDays,
  directDebitGraceDays,
  reminderSteps,
  type ReminderStage,
} from "@/lib/payments/collection-policy";
import { settleInvoice } from "@/lib/payments/settlement";
import type { Payment } from "@/lib/payments/types";

/**
 * Where an unpaid invoice stands in the reminder ladder, worked out every
 * time it is asked.
 *
 * Nothing here is stored except the two things that cannot be derived: which
 * reminders actually went out (`invoice_collection_events`) and what a human
 * decided (`invoice_collections`). How far along an invoice is, whether it is
 * ready to hand over, what goes out today -- all of that follows from those
 * two plus the invoice's own due date and settlement. A stored "reminder
 * stage" column would be a second truth that starts lying the moment someone
 * pays on day twenty-five.
 *
 * This is also the one decision function. The daily job asks it what to send
 * and the admin screen asks it what is coming, so the screen can never
 * promise something the job would not do.
 */
export type CollectionState = "active" | "paused" | "disputed" | "payment_plan" | "handed_over";

export const collectionStateOrder: readonly CollectionState[] = [
  "active",
  "paused",
  "disputed",
  "payment_plan",
  "handed_over",
];

export const collectionStateLabels: Record<CollectionState, string> = {
  active: "Automatisch",
  paused: "Gepauzeerd",
  disputed: "Betwist",
  payment_plan: "Betalingsregeling",
  handed_over: "Overgedragen",
};

export const collectionStateTone: Record<CollectionState, StatusTone> = {
  active: "accent",
  paused: "neutral",
  disputed: "danger",
  payment_plan: "neutral",
  handed_over: "neutral",
};

export function isCollectionState(value: string): value is CollectionState {
  return (collectionStateOrder as readonly string[]).includes(value);
}

/** One reminder this system tried to send. */
export type CollectionEvent = {
  id: string;
  invoiceId: string;
  customerId: string;
  stage: ReminderStage;
  eligibleOn: string;
  daysOverdue: number;
  recipient: string;
  subject: string;
  status: "pending" | "sent" | "failed";
  providerMessageId?: string;
  communicationId?: string;
  error?: string;
  claimedAt: string;
  sentAt?: string;
  createdAt: string;
};

/** Why the automation is not sending anything for this invoice right now. */
export type CollectionBlock =
  | "draft"
  | "not_sent"
  | "cancelled"
  | "paid"
  | "settled"
  | "paused"
  | "disputed"
  | "payment_plan"
  | "handed_over"
  | "payment_in_flight"
  | "direct_debit_pending"
  | "not_due"
  | "ladder_complete";

export const collectionBlockLabels: Record<CollectionBlock, string> = {
  draft: "Nog een concept; er is niets verstuurd om aan te herinneren.",
  not_sent: "Deze factuur is nog niet naar de klant verstuurd.",
  cancelled: "Deze factuur is geannuleerd.",
  paid: "Deze factuur is betaald.",
  settled: "Er staat niets meer open.",
  paused: "Herinneringen staan op pauze.",
  disputed: "De factuur is als betwist gemarkeerd.",
  payment_plan: "Er loopt een betalingsregeling.",
  handed_over: "De vordering is overgedragen.",
  payment_in_flight: "Er loopt een betaling; die wordt eerst afgewacht.",
  direct_debit_pending: "De automatische incasso is onderweg; die wordt eerst afgewacht.",
  not_due: "De vervaldatum is nog niet verstreken.",
  ladder_complete: "Alle herinneringen zijn verstuurd.",
};

export type CollectionAutomation = "running" | "paused" | "finished" | "inactive";

export const collectionAutomationLabels: Record<CollectionAutomation, string> = {
  running: "Actief",
  paused: "Gepauzeerd",
  finished: "Afgerond",
  inactive: "Niet van toepassing",
};

export const collectionAutomationTone: Record<CollectionAutomation, StatusTone> = {
  running: "accent",
  paused: "neutral",
  finished: "danger",
  inactive: "neutral",
};

/**
 * What an admin can decide about an invoice that is not being paid, in the
 * order the buttons appear. `active` is not here: resuming is the absence of
 * a decision, and the screen offers it as one button of its own.
 */
export const collectionActions: readonly { state: CollectionState; label: string; hint: string }[] = [
  { state: "paused", label: "Herinneringen pauzeren", hint: "Stopt de automatische herinneringen tot je ze hervat." },
  { state: "disputed", label: "Markeer als betwist", hint: "De klant betwist deze factuur; er gaat niets meer uit." },
  { state: "payment_plan", label: "Betalingsregeling actief", hint: "Er is een regeling afgesproken; de automatiek zwijgt." },
  { state: "handed_over", label: "Overgedragen", hint: "Je hebt de vordering zelf overgedragen." },
];

export type CollectionInput = {
  invoice: Invoice;
  /** Every payment recorded against this invoice, successful or not. */
  payments: readonly Payment[];
  /** Every reminder event for this invoice. */
  events: readonly CollectionEvent[];
  /** What a human decided; absent means nobody has intervened. */
  state?: CollectionState;
  /** True when a collecting monthly service bills this invoice. */
  directDebit?: boolean;
  /** Today in Amsterdam, from `toDateKey`. */
  todayKey: string;
};

export type CollectionView = {
  state: CollectionState;
  /** What is still owed, from the payments against this invoice. */
  outstandingCents: Cents;
  /** Whole days past the due date; zero while it has not passed. */
  daysOverdue: number;
  dueDate: string;
  /** Stages that really went out, oldest first. */
  sent: CollectionEvent[];
  /** The last attempt of every stage, including the ones that failed. */
  attempts: CollectionEvent[];
  /** The stage today's run would send, when it would send one. */
  dueStage?: ReminderStage;
  /** The next stage that is still ahead, and the day it becomes due. */
  nextStep?: { stage: ReminderStage; on: string };
  /** The day this invoice would become ready to hand over. */
  collectionReadyOn: string;
  /** Nothing automatic is left and a person has to decide. */
  collectionReady: boolean;
  automation: CollectionAutomation;
  /** Why nothing is going out today; absent when a stage is due now. */
  blocked?: CollectionBlock;
};

const stageRank: Record<ReminderStage, number> = {
  first_reminder: 0,
  second_reminder: 1,
  final_notice: 2,
};

const stoppedBy: Partial<Record<CollectionState, CollectionBlock>> = {
  paused: "paused",
  disputed: "disputed",
  payment_plan: "payment_plan",
  handed_over: "handed_over",
};

export function invoiceCollectionView(input: CollectionInput): CollectionView {
  const { invoice, payments, events, todayKey } = input;
  const state = input.state ?? "active";

  const total = calculateTotals(invoice.lines).totalCents;
  const settlement = settleInvoice(total, payments);
  const daysOverdue = Math.max(0, daysBetween(invoice.dueDate, todayKey));
  const collectionReadyOn = addDays(invoice.dueDate, collectionReadyDays);

  const forInvoice = events.filter((event) => event.invoiceId === invoice.id);
  const sent = forInvoice
    .filter((event) => event.status === "sent")
    .sort((a, b) => stageRank[a.stage] - stageRank[b.stage]);
  const attempts = [...forInvoice].sort((a, b) => stageRank[a.stage] - stageRank[b.stage]);
  const sentStages = new Set(sent.map((event) => event.stage));

  /*
    The earliest step that is due and has not gone out -- never a jump to the
    end. An invoice whose reminders were paused for a month and then resumed
    gets the friendly one first and the rest on the days after, because
    opening with a final notice to someone who was never reminded is not a
    ladder, it is an ambush.
  */
  const dueStep = reminderSteps.find(
    (step) => daysOverdue >= step.daysOverdue && !sentStages.has(step.stage),
  );
  const aheadStep = reminderSteps.find(
    (step) => daysOverdue < step.daysOverdue && !sentStages.has(step.stage),
  );

  const block = ((): CollectionBlock | undefined => {
    if (invoice.status === "draft") return "draft";
    if (invoice.status === "cancelled") return "cancelled";
    if (invoice.status === "paid") return "paid";
    if (!invoice.sentAt) return "not_sent";
    if (settlement.outstandingCents === 0) return "settled";
    const stopped = stoppedBy[state];
    if (stopped) return stopped;
    if (settlement.inFlight) return "payment_in_flight";
    /*
      A collection that is still on its way is not a customer who has not
      paid. The wait ends the moment a failure is on record, and in any case
      once the grace window is over -- a subscription that never charged is
      still something the customer should hear about.
    */
    if (
      input.directDebit &&
      !settlement.failedWithoutRecovery &&
      daysOverdue < directDebitGraceDays
    ) {
      return "direct_debit_pending";
    }
    if (daysOverdue < reminderSteps[0].daysOverdue) return "not_due";
    if (!dueStep) return "ladder_complete";
    return undefined;
  })();

  const collectionReady =
    sentStages.has("final_notice") &&
    daysOverdue >= collectionReadyDays &&
    settlement.outstandingCents > 0 &&
    state === "active";

  const automation: CollectionAutomation = (() => {
    if (block && ["draft", "not_sent", "cancelled", "paid", "settled"].includes(block)) return "inactive";
    if (stoppedBy[state]) return "paused";
    if (sentStages.has("final_notice") && !dueStep) return "finished";
    return "running";
  })();

  return {
    state,
    outstandingCents: settlement.outstandingCents,
    daysOverdue,
    dueDate: invoice.dueDate,
    sent,
    attempts,
    ...(block ? { blocked: block } : dueStep ? { dueStage: dueStep.stage } : {}),
    ...(aheadStep ? { nextStep: { stage: aheadStep.stage, on: addDays(invoice.dueDate, aheadStep.daysOverdue) } } : {}),
    collectionReadyOn,
    collectionReady,
    automation,
  };
}

/**
 * The same reading, for a whole list of invoices at once.
 *
 * The overview screens all need it: the dashboard counts what is ready to
 * hand over, the payments page lists what is being chased. Written once so
 * three screens cannot drift apart, and so none of them has to remember that
 * only a *collecting* service makes an invoice a direct debit one.
 */
export function invoiceCollectionViews(input: {
  invoices: readonly Invoice[];
  payments: readonly Payment[];
  events: readonly CollectionEvent[];
  /** What humans decided, by invoice id; absent means active. */
  states: ReadonlyMap<string, CollectionState>;
  /** Ids of the monthly services that are actually collecting right now. */
  collectingServiceIds: ReadonlySet<string>;
  todayKey: string;
}): { invoice: Invoice; view: CollectionView }[] {
  return input.invoices.map((invoice) => {
    const state = input.states.get(invoice.id);
    return {
      invoice,
      view: invoiceCollectionView({
        invoice,
        payments: input.payments.filter((payment) => payment.invoiceId === invoice.id),
        events: input.events.filter((event) => event.invoiceId === invoice.id),
        ...(state ? { state } : {}),
        directDebit: Boolean(invoice.recurringServiceId && input.collectingServiceIds.has(invoice.recurringServiceId)),
        todayKey: input.todayKey,
      }),
    };
  });
}
