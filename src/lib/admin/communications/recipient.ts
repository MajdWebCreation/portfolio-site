import type { CommunicationClient } from "@/lib/admin/communications/log";
import { isEmailAddress } from "@/lib/email/address";

/**
 * Who a customer mail goes to.
 *
 * Always the customer record as it is now: the `customers` row, read just
 * before the mail is built. Never the `customer_email` a quote or invoice
 * copied when it was made, never the `recipient_email` of an earlier send,
 * never an address a screen happened to hold. Those are records of the past;
 * a mail is addressed in the present.
 *
 * `sendCustomerEmail` accepts nothing else as its `to`. The type below can
 * only be produced by this module, so a flow added later cannot hand the door
 * a document's copy of an address -- it has to come through here, and here
 * reads the customer.
 *
 * The contact name travels with it, because "Beste …" belongs to the address
 * the mail goes to: a new address with the old person's name is the same
 * mistake in a different field. A billing address is the company's own
 * finance inbox, so its mail is still addressed to the contact person.
 */
declare const fromCustomerRecord: unique symbol;

export type CustomerRecipient = {
  readonly customerId: string;
  readonly email: string;
  readonly contactName: string;
  readonly [fromCustomerRecord]: true;
};

export type RecipientResult = { ok: true; recipient: CustomerRecipient } | { ok: false; reason: string };

export const missingCustomerReason = "Deze klant bestaat niet (meer).";
export const invalidRecipientReason =
  "Deze klant heeft geen geldig e-mailadres. Voeg eerst een e-mailadres toe bij de klantgegevens.";

/**
 * What the mail is about, which decides the address.
 *
 *   financial  invoices, reminders, credit notes, monthly-term and direct
 *              debit mail, price changes and the end of a monthly service
 *              (its remaining collections, pro-rata term and credits): the
 *              billing address when the customer set one, otherwise the
 *              contact address;
 *   general    everything else -- a quote: the contact address.
 *
 * Every caller names it; there is no default, so a new flow cannot send a
 * financial mail to the contact address by forgetting to ask.
 */
export type RecipientPurpose = "financial" | "general";

/** The columns of a `customers` row this needs, under their own names. */
export type CustomerContactRow = { id: string; email: string | null; billing_email?: string | null; contact_name: string };

export const customerContactColumns = "id, email, billing_email, contact_name";

/**
 * The recipient out of a `customers` row that was just read. For a caller
 * that already reads customers in bulk -- the daily reminder run -- so it
 * does not have to read each one a second time.
 *
 * No fallback of any kind: a customer without a usable address gets no mail,
 * and the caller is told why.
 */
export function recipientFromCustomer(row: CustomerContactRow | null | undefined, purpose: RecipientPurpose): RecipientResult {
  if (!row) return { ok: false, reason: missingCustomerReason };
  /* The billing address only for financial mail, and only when it is a usable address; the database already insists on that. */
  const billing = purpose === "financial" ? (row.billing_email ?? "").trim() : "";
  const email = billing && isEmailAddress(billing) ? billing : (row.email ?? "").trim();
  if (!email || !isEmailAddress(email)) return { ok: false, reason: invalidRecipientReason };
  return {
    ok: true,
    recipient: { customerId: row.id, email, contactName: row.contact_name.trim() } as CustomerRecipient,
  };
}

/**
 * Reads the customer and returns where their mail goes now.
 *
 * Takes the client the caller already holds, for the same reason the
 * communication log does: a server action reads under the admin's own row
 * level security, the webhook and the daily jobs under the elevated client.
 *
 * A failed read is a reason not to send, not an exception: every caller
 * already knows how to stop on a reason and say it.
 */
export async function resolveCustomerRecipient(db: CommunicationClient, customerId: string, purpose: RecipientPurpose): Promise<RecipientResult> {
  const { data, error } = await db.from("customers").select(customerContactColumns).eq("id", customerId).maybeSingle();
  if (error) return { ok: false, reason: `De klantgegevens konden niet worden geladen: ${error.message}` };
  return recipientFromCustomer(data, purpose);
}
