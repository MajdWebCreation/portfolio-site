import { addDays } from "@/lib/admin/documents/validation";
import type { Invoice } from "@/lib/admin/invoices/types";
import { collectionReadyDays, type ReminderStage } from "@/lib/payments/collection-policy";
import {
  invoiceCollectionView,
  type CollectionEvent,
  type CollectionState,
  type CollectionView,
} from "@/lib/payments/collection-state";
import type { Payment } from "@/lib/payments/types";

/**
 * The daily reminder pass.
 *
 * Invoice-driven from end to end. For every invoice that is still owed, the
 * derived view says which step of the ladder is due today; this runner sends
 * that one step and writes down that it did. It knows nothing about how the
 * money was meant to arrive -- a bounced direct debit and a bank transfer
 * that never came reach this loop as the same thing, an invoice with an
 * amount still on it.
 *
 * Three properties the design has to have, and where each one comes from:
 *
 *   never twice        the claim is an insert against a unique index on
 *                      (invoice_id, stage). Two runs, a retry, or two workers
 *                      at the same moment all end there: one inserts, the
 *                      rest read the row that exists.
 *
 *   never everything   every invoice is handled in its own try/catch. One
 *                      customer without an address, or one provider refusal,
 *                      costs that invoice its mail and nothing else.
 *
 *   never silently     a refusal leaves the row `failed` with the reason on
 *                      it, so tomorrow's run picks it up again instead of a
 *                      customer never hearing from us.
 *
 * At most one mail per invoice per day, by construction: exactly one stage is
 * due at a time, and the next one only becomes due on a later date. An
 * invoice that was paused for a month and resumed climbs the ladder a day at
 * a time rather than firing three mails at once.
 *
 * Written against injected dependencies, so every decision here is testable
 * without a database, a scheduler or a mail provider.
 */
export type ReminderCandidate = {
  invoice: Invoice;
  /** Every payment recorded against this invoice. */
  payments: Payment[];
  /** Every reminder event this invoice already has. */
  events: CollectionEvent[];
  /** What a human decided; absent means nobody has intervened. */
  state?: CollectionState;
  /** True when a collecting monthly service bills this invoice. */
  directDebit: boolean;
  /** Where the invoice was delivered, and who to greet. */
  recipientEmail: string;
  contactName: string;
};

export type ReminderClaim = {
  id: string;
  status: "pending" | "sent" | "failed";
  /** ISO timestamp of when this attempt took the row. */
  claimedAt: string;
};

export type ClaimKey = {
  invoiceId: string;
  customerId: string;
  stage: ReminderStage;
  /** The day this stage became due, from the invoice's own due date. */
  eligibleOn: string;
  daysOverdue: number;
  recipientEmail: string;
  subject: string;
};

export type ReminderStore = {
  /**
   * Invoices that could conceivably need chasing, with what is needed to
   * decide. Filtering to "sent or overdue, not paid, not cancelled" belongs
   * in the query; everything finer is decided here, by the same function the
   * admin screen uses.
   */
  listCandidates: () => Promise<ReminderCandidate[]>;
  /** Takes the stage, or reports the claim that already exists. */
  claim: (key: ClaimKey) => Promise<{ claimed: true; id: string } | { claimed: false; existing: ReminderClaim }>;
  markSent: (input: {
    claimId: string;
    sentAt: string;
    messageId?: string;
    communicationId?: string;
  }) => Promise<void>;
  markFailed: (id: string, reason: string) => Promise<void>;
};

export type ReminderMailInput = {
  invoice: Invoice;
  stage: ReminderStage;
  recipientEmail: string;
  contactName: string;
  daysOverdue: number;
  outstandingCents: number;
  /** Last day of the final notice's grace period. */
  finalDateKey: string;
  /**
   * The payments already recorded against this invoice, handed over rather
   * than read again: the mailer needs them to work out which payment link
   * still fits, and they were loaded before any of this was decided.
   */
  payments: readonly Payment[];
};

export type ReminderMailer = (
  input: ReminderMailInput,
) => Promise<
  | { sent: true; sentAt: string; messageId?: string; communicationId?: string }
  | { sent: false; reason: string }
>;

/** Something an admin has to look at, rather than a normal skip. */
export type ReminderProblem = { invoiceId: string; reason: string };

export type ReminderSummary = {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Invoices where the automation has run out and a person has to decide. */
  collectionReady: string[];
  problems: ReminderProblem[];
};

/**
 * A claim left `pending` by a run that died is retried after this long. The
 * same reasoning, and the same hour, as the pre-notification job.
 */
export const stalePendingMs = 60 * 60 * 1000;

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function retryable(existing: ReminderClaim, now: number): boolean {
  if (existing.status === "sent") return false;
  if (existing.status === "failed") return true;
  return now - new Date(existing.claimedAt).getTime() > stalePendingMs;
}

export async function runPaymentReminders(
  store: ReminderStore,
  mail: ReminderMailer,
  subjectFor: (stage: ReminderStage) => string,
  todayKey: string,
  now: Date = new Date(),
): Promise<ReminderSummary> {
  const summary: ReminderSummary = {
    considered: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    collectionReady: [],
    problems: [],
  };

  for (const candidate of await store.listCandidates()) {
    summary.considered += 1;
    const { invoice } = candidate;

    try {
      const view: CollectionView = invoiceCollectionView({
        invoice,
        payments: candidate.payments,
        events: candidate.events,
        ...(candidate.state ? { state: candidate.state } : {}),
        directDebit: candidate.directDebit,
        todayKey,
      });

      /*
        Nothing automatic is left and the invoice is still owed. Recorded in
        the summary so the run says so out loud, and nowhere else: whether an
        invoice is ready to hand over follows from the final notice and the
        calendar, so there is nothing to write down and nothing to clean up
        when the customer pays on day twenty-five.
      */
      if (view.collectionReady) summary.collectionReady.push(invoice.id);

      if (!view.dueStage) {
        summary.skipped += 1;
        continue;
      }

      const recipient = candidate.recipientEmail.trim();
      if (!recipient || !isEmail(recipient)) {
        // Never guess an address, and never chase nobody.
        summary.problems.push({ invoiceId: invoice.id, reason: "Klant heeft geen bruikbaar e-mailadres." });
        summary.skipped += 1;
        continue;
      }

      const stage = view.dueStage;
      const step = { stage, daysOverdue: view.daysOverdue };
      const key: ClaimKey = {
        invoiceId: invoice.id,
        customerId: invoice.customer.customerId,
        stage,
        eligibleOn: todayKey,
        daysOverdue: step.daysOverdue,
        recipientEmail: recipient,
        subject: subjectFor(stage),
      };

      const claim = await store.claim(key);
      let recordId: string;

      if (claim.claimed) {
        recordId = claim.id;
      } else if (retryable(claim.existing, now.getTime())) {
        recordId = claim.existing.id;
      } else {
        // Already sent, or another run has it in hand right now.
        summary.skipped += 1;
        continue;
      }

      let result: Awaited<ReturnType<ReminderMailer>>;
      try {
        result = await mail({
          invoice,
          stage,
          recipientEmail: recipient,
          contactName: candidate.contactName,
          daysOverdue: view.daysOverdue,
          outstandingCents: view.outstandingCents,
          finalDateKey: addDays(invoice.dueDate, collectionReadyDays),
          payments: candidate.payments,
        });
      } catch (error) {
        result = { sent: false, reason: error instanceof Error ? error.message : "onbekende fout" };
      }

      if (result.sent) {
        await store.markSent({
          claimId: recordId,
          sentAt: result.sentAt,
          ...(result.messageId ? { messageId: result.messageId } : {}),
          ...(result.communicationId ? { communicationId: result.communicationId } : {}),
        });
        summary.sent += 1;
      } else {
        /*
          The row stays, marked failed, so tomorrow's run retries this same
          stage rather than skipping past it. It is never a second row, so a
          customer cannot receive the same reminder twice because of a retry.
        */
        await store.markFailed(recordId, result.reason);
        summary.failed += 1;
        summary.problems.push({ invoiceId: invoice.id, reason: `Verzenden mislukt: ${result.reason}` });
      }
    } catch (error) {
      /*
        One invoice's problem is one invoice's problem. A broken record, a
        database hiccup on a single claim -- the loop moves on, because the
        other customers' reminders have nothing to do with it.
      */
      const reason = error instanceof Error ? error.message : "onbekende fout";
      summary.problems.push({ invoiceId: invoice.id, reason });
      summary.failed += 1;
    }
  }

  return summary;
}
