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
 * mistake in a different field.
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

/** The columns of a `customers` row this needs, under their own names. */
export type CustomerContactRow = { id: string; email: string | null; contact_name: string };

export const customerContactColumns = "id, email, contact_name";

/**
 * The recipient out of a `customers` row that was just read. For a caller
 * that already reads customers in bulk -- the daily reminder run -- so it
 * does not have to read each one a second time.
 *
 * No fallback of any kind: a customer without a usable address gets no mail,
 * and the caller is told why.
 */
export function recipientFromCustomer(row: CustomerContactRow | null | undefined): RecipientResult {
  if (!row) return { ok: false, reason: missingCustomerReason };
  const email = (row.email ?? "").trim();
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
export async function resolveCustomerRecipient(db: CommunicationClient, customerId: string): Promise<RecipientResult> {
  const { data, error } = await db.from("customers").select(customerContactColumns).eq("id", customerId).maybeSingle();
  if (error) return { ok: false, reason: `De klantgegevens konden niet worden geladen: ${error.message}` };
  return recipientFromCustomer(data);
}
