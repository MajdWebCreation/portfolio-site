import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { creditNoteColumns, creditNoteFromRow, refundColumns, refundFromRow, type CreditNoteRow } from "@/lib/admin/credit-notes/mapper";
import { invoiceLedger, type CreditNoteLedger } from "@/lib/admin/credit-notes/settlement";
import { isFinanciallyIssued, type CreditNote, type Refund, type RefundStatus } from "@/lib/admin/credit-notes/types";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { Invoice } from "@/lib/admin/invoices/types";
import {
  createRefund,
  getPayment,
  getRefund,
  listPaymentRefunds,
  MollieError,
  refundableCents,
  type MolliePayment,
  type MollieRefund,
  type MollieRefundStatus,
} from "@/lib/mollie/client";
import { getMollieConfig, isMollieConfigured, type MollieConfig } from "@/lib/mollie/config";
import { formatCents } from "@/lib/money";
import { paymentFromRow } from "@/lib/payments/mapper";
import type { Payment } from "@/lib/payments/types";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Money back to the customer, against a credit note.
 *
 * Two methods, one table: a refund Mollie carries out, or one the admin made
 * by bank transfer and writes down. Neither happens by itself -- not when a
 * service is cancelled, not when a credit note is made, not when it is
 * mailed. An admin presses "terugbetalen", reads what is about to happen,
 * and confirms.
 *
 * The Mollie refund is the part that must never run twice, and the defence
 * is layered on purpose:
 *
 *   1. the local row is the claim. It is inserted, status pending and no
 *      Mollie id yet, before Mollie is called; a partial unique index allows
 *      one such row per credit note, so a double click ends in 23505 and is
 *      told the first one is in progress;
 *   2. the row's id is Mollie's Idempotency-Key and sits in the refund's
 *      metadata, so a retry of the same POST returns the same refund, and a
 *      refund Mollie made is recognisable from our side afterwards;
 *   3. a claim that never got its answer written -- Mollie refunded, our
 *      write failed -- is recovered before anything new is attempted: the
 *      payment's refunds are listed at Mollie and the one carrying our id
 *      is adopted. Only when Mollie has nothing for a claim older than a
 *      few minutes is it closed as never made;
 *   4. the amount is checked three times: against the ledger (what this
 *      note still owes back), against Mollie's `amountRemaining`, and in
 *      the database against the note's total and the invoice's payments.
 *
 * A failed Mollie refund is written as failed and shown as such; it is
 * never shown as money that went back.
 */
type Db = SupabaseClient<Database>;

export const staleClaimMinutes = 10;

export type RefundOutcome =
  | { ok: true; refund: Refund; recovered: boolean; warning?: string }
  | { ok: false; reason: string };

export const notIssuedReason = "Deze creditnota is nog niet afgerond (geen opgeslagen PDF); terugbetalen kan pas daarna.";

export const refundInProgressReason =
  "Er loopt al een terugbetaling voor deze creditnota. Wacht even en controleer de status voordat je het opnieuw probeert.";

function fail(operation: string, error: { message: string } | null): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export function refundStatusFromMollie(status: MollieRefundStatus): RefundStatus {
  return status === "queued" ? "pending" : status;
}

type Context = { creditNote: CreditNote; invoice: Invoice; payments: Payment[]; creditNotes: CreditNote[]; refunds: Refund[]; ledger: CreditNoteLedger };

async function loadContext(db: Db, creditNoteId: string): Promise<Context | undefined> {
  const note = await db.from("credit_notes").select(creditNoteColumns).eq("id", creditNoteId).maybeSingle();
  fail("Creditnota laden", note.error);
  if (!note.data) return undefined;
  const creditNote = creditNoteFromRow(note.data as unknown as CreditNoteRow);

  const [invoice, payments, notes, refunds] = await Promise.all([
    db.from("invoices").select(invoiceColumns).eq("id", creditNote.invoiceId).maybeSingle(),
    db.from("payments").select("id, invoice_id, customer_id, amount_cents, currency, status, source, provider_payment_id, method, paid_at, description, created_at, updated_at").eq("invoice_id", creditNote.invoiceId),
    db.from("credit_notes").select(creditNoteColumns).eq("invoice_id", creditNote.invoiceId),
    db.from("refunds").select(refundColumns).eq("invoice_id", creditNote.invoiceId),
  ]);
  fail("Factuur laden", invoice.error);
  fail("Betalingen laden", payments.error);
  fail("Creditnota's laden", notes.error);
  fail("Terugbetalingen laden", refunds.error);
  if (!invoice.data) return undefined;

  const context = {
    creditNote,
    invoice: invoiceFromRow(invoice.data as unknown as InvoiceRow),
    payments: (payments.data ?? []).map(paymentFromRow),
    creditNotes: ((notes.data ?? []) as unknown as CreditNoteRow[]).map(creditNoteFromRow),
    refunds: (refunds.data ?? []).map(refundFromRow),
  };
  const ledger = invoiceLedger(context).notes.find((entry) => entry.creditNoteId === creditNoteId);
  return {
    ...context,
    ledger: ledger ?? { creditNoteId, totalCents: creditNote.totalCents, refundDueCents: 0, refundedCents: 0, inFlightCents: 0, remainingCents: 0, lastRefundFailed: false, state: "offset" },
  };
}

function minutesSince(iso: string, now: Date): number {
  return (now.getTime() - Date.parse(iso)) / 60_000;
}

async function writeAnswer(db: Db, refundId: string, mollie: MollieRefund): Promise<Refund | undefined> {
  const status = refundStatusFromMollie(mollie.status);
  const { data, error } = await db
    .from("refunds")
    .update({
      provider_refund_id: mollie.id,
      status,
      claimed_at: null,
      settled_at: status === "refunded" ? new Date().toISOString() : null,
      failure_reason: status === "failed" ? "Mollie meldt dat de terugbetaling is mislukt." : status === "canceled" ? "Mollie meldt dat de terugbetaling is geannuleerd." : null,
    })
    .eq("id", refundId)
    .select(refundColumns)
    .maybeSingle();
  if (error) {
    console.error("Refund recorded at Mollie but the local write failed", { refundId, providerRefundId: mollie.id, error: error.message });
    return undefined;
  }
  return data ? refundFromRow(data) : undefined;
}

/**
 * The claims of a credit note that never got their answer. Each is looked
 * up at Mollie by the id we put in its metadata; found, it is adopted. Not
 * found and old enough, it is closed: Mollie never made it. Not found and
 * fresh, it may be in flight this very second, and the caller waits.
 */
export async function recoverClaimedRefunds(db: Db, creditNoteId: string, now: Date, config: MollieConfig): Promise<{ recovered: Refund[]; waiting: boolean }> {
  const { data, error } = await db
    .from("refunds")
    .select(refundColumns)
    .eq("credit_note_id", creditNoteId)
    .eq("method", "mollie")
    .eq("status", "pending")
    .is("provider_refund_id", null);
  fail("Terugbetalingen laden", error);
  const claims = (data ?? []).map(refundFromRow);
  const recovered: Refund[] = [];
  let waiting = false;

  for (const claim of claims) {
    if (!claim.providerPaymentId) continue;
    const atMollie = await listPaymentRefunds(claim.providerPaymentId, config);
    const ours = atMollie.find((refund) => refund.metadata?.refundId === claim.id);
    if (ours) {
      const adopted = await writeAnswer(db, claim.id, ours);
      if (adopted) recovered.push(adopted);
      continue;
    }
    if (minutesSince(claim.claimedAt ?? claim.createdAt, now) < staleClaimMinutes) {
      waiting = true;
      continue;
    }
    const { error: closeError } = await db
      .from("refunds")
      .update({ status: "canceled", claimed_at: null, failure_reason: "Afgebroken voordat Mollie de terugbetaling aanmaakte; er is niets terugbetaald." })
      .eq("id", claim.id)
      .is("provider_refund_id", null)
      .eq("status", "pending");
    fail("Afgebroken terugbetaling sluiten", closeError);
  }
  return { recovered, waiting };
}

/** "€ X terugbetalen via Mollie". */
export async function refundViaMollie(
  db: Db,
  creditNoteId: string,
  amountCents: number,
  actor: { userId: string },
  now: Date = new Date(),
): Promise<RefundOutcome> {
  if (!isMollieConfigured()) return { ok: false, reason: "Mollie is niet geconfigureerd." };
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return { ok: false, reason: "Vul een bedrag hoger dan nul in." };
  const config = getMollieConfig();

  const first = await loadContext(db, creditNoteId);
  if (!first) return { ok: false, reason: "Deze creditnota bestaat niet (meer)." };
  if (!isFinanciallyIssued(first.creditNote)) return { ok: false, reason: notIssuedReason };

  // 3. Whatever was claimed and never answered, first.
  const recovery = await recoverClaimedRefunds(db, creditNoteId, now, config);
  if (recovery.waiting) return { ok: false, reason: refundInProgressReason };
  const context = recovery.recovered.length > 0 ? (await loadContext(db, creditNoteId))! : first;

  // 4a. The ledger: what this note still owes back.
  if (context.ledger.remainingCents <= 0) {
    return { ok: false, reason: context.ledger.inFlightCents > 0 ? refundInProgressReason : "Op deze creditnota hoeft niets (meer) te worden terugbetaald." };
  }
  if (amountCents > context.ledger.remainingCents) {
    return { ok: false, reason: `Nog terug te betalen is ${formatCents(context.ledger.remainingCents)}; een hoger bedrag kan niet.` };
  }

  // 4b. Mollie: a paid payment of this invoice with room for the amount.
  const candidates = context.payments.filter((payment) => payment.status === "paid" && payment.source === "mollie" && payment.providerPaymentId);
  if (candidates.length === 0) return { ok: false, reason: "Deze factuur is niet via Mollie betaald; markeer de terugbetaling handmatig." };
  let chosen: { payment: Payment; mollie: MolliePayment } | undefined;
  const reasons: string[] = [];
  for (const payment of [...candidates].sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))) {
    const mollie = await getPayment(payment.providerPaymentId!, config);
    const room = refundableCents(mollie);
    if (room >= amountCents) {
      chosen = { payment, mollie };
      break;
    }
    reasons.push(`${payment.providerPaymentId}: ${room > 0 ? `nog ${formatCents(room)} terug te betalen` : "niet (meer) terug te betalen via Mollie"}`);
  }
  if (!chosen) return { ok: false, reason: `Mollie laat dit bedrag niet terugbetalen (${reasons.join("; ")}). Betaal handmatig terug en markeer dat hier.` };

  // 1. The claim.
  const id = randomUUID();
  const claim = await db
    .from("refunds")
    .insert({
      id,
      credit_note_id: creditNoteId,
      invoice_id: context.invoice.id,
      customer_id: context.creditNote.customer.customerId,
      amount_cents: amountCents,
      currency: "EUR",
      method: "mollie",
      status: "pending",
      payment_id: chosen.payment.id,
      provider: "mollie",
      provider_payment_id: chosen.payment.providerPaymentId!,
      provider_refund_id: null,
      idempotency_key: `refund-${id}`,
      claimed_at: now.toISOString(),
      settled_at: null,
      failure_reason: null,
      created_by: actor.userId,
    })
    .select(refundColumns)
    .single();
  if (claim.error) {
    if (claim.error.code === "23505") return { ok: false, reason: refundInProgressReason };
    return { ok: false, reason: claim.error.message };
  }

  // 2. Mollie, with the claim's id as the key.
  let mollie: MollieRefund;
  try {
    mollie = await createRefund({
      paymentId: chosen.payment.providerPaymentId!,
      amountCents,
      description: `Creditnota ${context.creditNote.number.value} op factuur ${context.invoice.number.value}`,
      metadata: { refundId: id, creditNote: context.creditNote.number.value },
      idempotencyKey: `refund-${id}`,
      config,
    });
  } catch (error) {
    const reason = error instanceof MollieError ? error.detail : error instanceof Error ? error.message : "onbekende fout";
    /*
      A refusal is final: Mollie made nothing. A network failure is not, and
      the claim stays for recovery -- Mollie may well have made the refund
      and lost the answer on the way back.
    */
    if (error instanceof MollieError) {
      const { error: writeError } = await db
        .from("refunds")
        .update({ status: "failed", claimed_at: null, failure_reason: `Mollie weigerde de terugbetaling: ${reason}` })
        .eq("id", id);
      fail("Mislukte terugbetaling vastleggen", writeError);
      return { ok: false, reason: `Mollie weigerde de terugbetaling: ${reason}` };
    }
    console.error("Mollie refund request failed without an answer; the claim stays for recovery", { refundId: id, error });
    return { ok: false, reason: `Mollie gaf geen antwoord (${reason}). De poging staat als 'in behandeling'; controleer de status over enkele minuten voordat je opnieuw probeert.` };
  }

  const written = await writeAnswer(db, id, mollie);
  if (!written) {
    return {
      ok: true,
      refund: { ...refundFromRow(claim.data), providerRefundId: mollie.id, status: refundStatusFromMollie(mollie.status) },
      recovered: false,
      warning: `Mollie heeft terugbetaling ${mollie.id} aangemaakt, maar dat kon lokaal niet worden vastgelegd. Bij de volgende statuscontrole wordt hij overgenomen; er wordt niet opnieuw terugbetaald.`,
    };
  }
  if (written.status === "failed") return { ok: false, reason: "Mollie meldt dat de terugbetaling is mislukt." };
  return { ok: true, refund: written, recovered: false };
}

/** "Handmatig terugbetaald markeren": a bank transfer the admin made. Nothing is executed. */
export async function markManualRefund(
  db: Db,
  creditNoteId: string,
  input: { amountCents: number; settledOn: string; note: string },
  actor: { userId: string },
): Promise<RefundOutcome> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) return { ok: false, reason: "Vul een bedrag hoger dan nul in." };
  const context = await loadContext(db, creditNoteId);
  if (!context) return { ok: false, reason: "Deze creditnota bestaat niet (meer)." };
  if (!isFinanciallyIssued(context.creditNote)) return { ok: false, reason: notIssuedReason };
  if (context.ledger.remainingCents <= 0) return { ok: false, reason: "Op deze creditnota hoeft niets (meer) te worden terugbetaald." };
  if (input.amountCents > context.ledger.remainingCents) {
    return { ok: false, reason: `Nog terug te betalen is ${formatCents(context.ledger.remainingCents)}; een hoger bedrag kan niet.` };
  }

  const id = randomUUID();
  const { data, error } = await db
    .from("refunds")
    .insert({
      id,
      credit_note_id: creditNoteId,
      invoice_id: context.invoice.id,
      customer_id: context.creditNote.customer.customerId,
      amount_cents: input.amountCents,
      currency: "EUR",
      method: "manual",
      status: "refunded",
      idempotency_key: `manual-${id}`,
      settled_at: `${input.settledOn}T12:00:00+02:00`,
      settled_by: actor.userId,
      note: input.note.trim(),
      created_by: actor.userId,
    })
    .select(refundColumns)
    .single();
  if (error) return { ok: false, reason: error.message };
  return { ok: true, refund: refundFromRow(data), recovered: false };
}

/** "Status controleren": Mollie's current word on one refund. */
export async function refreshRefund(db: Db, refundId: string): Promise<RefundOutcome> {
  const { data, error } = await db.from("refunds").select(refundColumns).eq("id", refundId).maybeSingle();
  fail("Terugbetaling laden", error);
  if (!data) return { ok: false, reason: "Deze terugbetaling bestaat niet (meer)." };
  const refund = refundFromRow(data);
  if (refund.method !== "mollie" || !refund.providerPaymentId) return { ok: true, refund, recovered: false };
  const config = getMollieConfig();

  if (!refund.providerRefundId) {
    const recovery = await recoverClaimedRefunds(db, refund.creditNoteId, new Date(), config);
    const found = recovery.recovered.find((entry) => entry.id === refundId);
    if (found) return { ok: true, refund: found, recovered: true };
    const again = await db.from("refunds").select(refundColumns).eq("id", refundId).maybeSingle();
    return { ok: true, refund: again.data ? refundFromRow(again.data) : refund, recovered: false };
  }

  const mollie = await getRefund(refund.providerPaymentId, refund.providerRefundId, config);
  const written = await writeAnswer(db, refundId, mollie);
  return { ok: true, refund: written ?? refund, recovered: false };
}

/**
 * What Mollie says about a payment's refunds, written to the rows that
 * carry them. Run by the webhook when a payment changes: a refund reaching
 * `refunded` makes Mollie call the payment's webhook, and this is how that
 * reaches the credit note's page without anyone pressing a button. Claims
 * without an answer are adopted here too.
 */
export async function syncRefundsForPayment(db: Db, molliePaymentId: string, config?: MollieConfig): Promise<number> {
  const { data, error } = await db.from("refunds").select(refundColumns).eq("provider", "mollie").eq("provider_payment_id", molliePaymentId);
  fail("Terugbetalingen laden", error);
  const rows = (data ?? []).map(refundFromRow);
  if (rows.length === 0) return 0;
  const atMollie = await listPaymentRefunds(molliePaymentId, config);
  let updated = 0;
  for (const row of rows) {
    const match = atMollie.find((refund) => (row.providerRefundId ? refund.id === row.providerRefundId : refund.metadata?.refundId === row.id));
    if (!match) continue;
    if (row.providerRefundId && refundStatusFromMollie(match.status) === row.status) continue;
    if (await writeAnswer(db, row.id, match)) updated += 1;
  }
  return updated;
}
