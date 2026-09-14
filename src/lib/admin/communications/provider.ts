import { Resend } from "resend";
import { companyProfile } from "@/lib/admin/documents/company";

/**
 * The one place a customer mail is handed to Resend.
 *
 * Everything in this module runs on the server. The API key is read here and
 * nowhere else; it is not a NEXT_PUBLIC value and never reaches a bundle that
 * goes to the browser.
 *
 * Kept apart from the module that logs the send so that a test can replace
 * the provider without replacing the bookkeeping, which is the thing under
 * test.
 */
export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Defaults to the company address; every transactional mail is answerable. */
  replyTo?: string;
  attachments?: { filename: string; content: Buffer }[];
};

export type DeliveryFailure = {
  sent: false;
  /** What to tell the admin. */
  reason: string;
  /**
   * config    the deployment is missing a key or a sender.
   * rejected  Resend answered, and said no.
   * error     the call threw: network, timeout, an unexpected shape.
   */
  failure: "config" | "rejected" | "error";
};

export type DeliveryResult = { sent: true; sentAt: string; messageId?: string } | DeliveryFailure;

/**
 * The mail configuration, read at call time.
 *
 * Documents, activation links and the contact form all go out over the same
 * Resend account and sender: there is one mail setup, not three. A missing
 * value is a configuration error the admin should see, not a silent no-op.
 */
function mailConfig(): { apiKey: string; from: string } | { error: string } {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !from) {
    return { error: "Mailconfiguratie ontbreekt (RESEND_API_KEY of CONTACT_FROM_EMAIL)." };
  }

  return { apiKey, from };
}

/**
 * Hands the message to Resend. Returns a result rather than throwing, so the
 * caller decides what to persist: nothing is written anywhere before this
 * says `sent: true`.
 */
export async function deliverEmail(email: OutboundEmail): Promise<DeliveryResult> {
  const config = mailConfig();
  if ("error" in config) return { sent: false, reason: config.error, failure: "config" };

  try {
    const result = await new Resend(config.apiKey).emails.send({
      from: config.from,
      to: email.to,
      replyTo: email.replyTo ?? companyProfile.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.attachments ? { attachments: email.attachments } : {}),
    });

    if (result.error) return { sent: false, reason: result.error.message, failure: "rejected" };

    return {
      sent: true,
      sentAt: new Date().toISOString(),
      ...(result.data?.id ? { messageId: result.data.id } : {}),
    };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "Onbekende fout",
      failure: "error",
    };
  }
}
