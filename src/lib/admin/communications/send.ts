import { recordCommunication, type CommunicationContext } from "@/lib/admin/communications/log";
import { deliverEmail, type DeliveryResult, type OutboundEmail } from "@/lib/admin/communications/provider";

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
 */
export type SendCustomerEmailResult =
  | { sent: true; sentAt: string; messageId?: string; communicationId?: string }
  | Extract<DeliveryResult, { sent: false }>;

export async function sendCustomerEmail(
  email: OutboundEmail,
  context: CommunicationContext,
): Promise<SendCustomerEmailResult> {
  const delivery = await deliverEmail(email);
  if (!delivery.sent) return delivery;

  const communicationId = await recordCommunication(context, {
    recipient: email.to,
    subject: email.subject,
    bodyText: email.text,
    bodyHtml: email.html,
    sentAt: delivery.sentAt,
    ...(delivery.messageId ? { providerMessageId: delivery.messageId } : {}),
  });

  return { ...delivery, ...(communicationId ? { communicationId } : {}) };
}

export type { CommunicationContext } from "@/lib/admin/communications/log";
export type { DeliveryResult, OutboundEmail } from "@/lib/admin/communications/provider";
