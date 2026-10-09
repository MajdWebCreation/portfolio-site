import { recordCommunication, type CommunicationContext } from "@/lib/admin/communications/log";
import { deliverEmail, type DeliveryResult, type OutboundEmail } from "@/lib/admin/communications/provider";
import type { CustomerRecipient } from "@/lib/admin/communications/recipient";
import { redactSecrets } from "@/lib/admin/communications/redact";

/**
 * The one way this system mails a customer.
 *
 * Every transactional flow -- the quote, the invoice, the invoice that also
 * authorises a monthly collection, the monthly term, the standalone direct
 * debit link -- goes through here, and none of them writes to the log itself.
 * That is the whole point: a flow added later cannot forget to register what
 * it sent, because sending is registering.
 *
 * The order is deliberate and is the same order the document flows already
 * use for their own status columns:
 *
 *   1. The provider accepts the message, or it does not.
 *   2. Only then is the communication written.
 *
 * So a failed send leaves nothing behind. There is no "sent" record for a
 * mail the customer never got, and a retry produces one row, not two.
 *
 * A second send of the same document is a second row, deliberately. The
 * customer received two mails; a log that quietly overwrote the first would
 * be telling the admin something that did not happen.
 *
 * Who it goes to is not a string. `to` is a `CustomerRecipient`, which only
 * `communications/recipient.ts` makes, out of the customer record as it is
 * now -- so no flow can address a mail from a document's copy of an address,
 * an earlier send, or a stale screen. It must also be the customer the mail
 * is filed under: one customer's address under another's record would be a
 * mail sent to the wrong person, written down as the right one.
 */
export type CustomerEmail = Omit<OutboundEmail, "to"> & { to: CustomerRecipient };

export type SendCustomerEmailResult =
  | { sent: true; sentAt: string; messageId?: string; communicationId?: string }
  | Extract<DeliveryResult, { sent: false }>;

export async function sendCustomerEmail(
  email: CustomerEmail,
  context: CommunicationContext,
): Promise<SendCustomerEmailResult> {
  if (email.to.customerId !== context.customerId) {
    return { sent: false, reason: "De ontvanger hoort niet bij deze klant; er is niets verstuurd.", failure: "config" };
  }

  const delivery = await deliverEmail({ ...email, to: email.to.email });
  if (!delivery.sent) return delivery;

  // The copy in the log is the mail minus its secrets: an activation link
  // keeps its shape but not its token. The mail itself went out unchanged.
  const communicationId = await recordCommunication(context, {
    recipient: email.to.email,
    subject: email.subject,
    bodyText: redactSecrets(email.text),
    bodyHtml: redactSecrets(email.html),
    sentAt: delivery.sentAt,
    ...(delivery.messageId ? { providerMessageId: delivery.messageId } : {}),
  });

  return { ...delivery, ...(communicationId ? { communicationId } : {}) };
}

export type { CommunicationContext } from "@/lib/admin/communications/log";
export type { DeliveryResult, OutboundEmail } from "@/lib/admin/communications/provider";
export type { CustomerRecipient } from "@/lib/admin/communications/recipient";
