import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type ContactPayload = {
  name: string;
  email: string;
  company?: string;
  message: string;
  website?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ContactPayload;

    const name = body.name?.trim() ?? "";
    const email = body.email?.trim() ?? "";
    const company = body.company?.trim() ?? "";
    const message = body.message?.trim() ?? "";
    const website = body.website?.trim() ?? "";

    if (website) {
      return Response.json({ ok: true });
    }

    if (name.length < 2 || email.length < 5 || message.length < 12) {
      return Response.json(
        { error: "Invalid form submission." },
        { status: 400 }
      );
    }

    const to = process.env.CONTACT_TO_EMAIL;
    const from = process.env.CONTACT_FROM_EMAIL;

    if (!to || !from || !process.env.RESEND_API_KEY) {
      return Response.json(
        { error: "Missing mail configuration." },
        { status: 500 }
      );
    }

    const adminSubject = `New website inquiry from ${name}`;

    const adminHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111827;">
        <h2 style="margin:0 0 20px;">New contact form submission</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Company:</strong> ${escapeHtml(company || "—")}</p>
        <p><strong>Message:</strong></p>
        <div style="margin-top:8px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;white-space:pre-wrap;">${escapeHtml(
          message
        )}</div>
      </div>
    `;

    const adminText = `
New contact form submission

Name: ${name}
Email: ${email}
Company: ${company || "—"}

Message:
${message}
    `.trim();

    const adminResult = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: adminSubject,
      html: adminHtml,
      text: adminText,
    });

    if (adminResult.error) {
      return Response.json({ error: adminResult.error.message }, { status: 500 });
    }

    const autoReplySubject = "We received your message — YM Creations";

    const autoReplyHtml = `
      <div style="margin:0;padding:0;background:#050505;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
        <div style="max-width:640px;margin:0 auto;padding:40px 20px;">
          <div style="border:1px solid rgba(255,255,255,0.1);border-radius:28px;overflow:hidden;background:rgba(255,255,255,0.04);">
            <div style="padding:32px 32px 20px;border-bottom:1px solid rgba(255,255,255,0.08);background:radial-gradient(circle at top, rgba(34,211,238,0.18), transparent 45%), #050505;">
              <p style="margin:0 0 14px;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:rgba(103,232,249,0.88);">
                YM Creations
              </p>
              <h1 style="margin:0;font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;">
                We received your message.
              </h1>
              <p style="margin:16px 0 0;font-size:15px;line-height:1.8;color:rgba(255,255,255,0.68);">
                Hi ${escapeHtml(name)}, thanks for reaching out. Your message came through successfully and we’ll get back to you as soon as possible.
              </p>
            </div>

            <div style="padding:28px 32px;">
              <div style="margin-bottom:20px;padding:20px;border:1px solid rgba(255,255,255,0.08);border-radius:20px;background:#0b0b0b;">
                <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(103,232,249,0.82);">
                  Your message
                </p>
                <div style="font-size:14px;line-height:1.9;color:rgba(255,255,255,0.72);white-space:pre-wrap;">${escapeHtml(
                  message
                )}</div>
              </div>

              <div style="padding:20px;border:1px solid rgba(255,255,255,0.08);border-radius:20px;background:#080808;">
                <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                  What happens next
                </p>
                <p style="margin:0;font-size:14px;line-height:1.9;color:rgba(255,255,255,0.68);">
                  We’ll review your inquiry and reply personally from <span style="color:#ffffff;">contact@ymcreations.com</span>.
                </p>
              </div>
            </div>

            <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;line-height:1.8;color:rgba(255,255,255,0.42);">
              YM Creations<br />
              Premium web design & development<br />
              ymcreations.com
            </div>
          </div>
        </div>
      </div>
    `;

    const autoReplyText = `
Hi ${name},

Thanks for reaching out to YM Creations.
We received your message successfully and will get back to you as soon as possible.

Your message:
${message}

YM Creations
contact@ymcreations.com
ymcreations.com
    `.trim();

    const autoReplyResult = await resend.emails.send({
      from,
      to: email,
      subject: autoReplySubject,
      html: autoReplyHtml,
      text: autoReplyText,
    });

    if (autoReplyResult.error) {
      return Response.json(
        { error: autoReplyResult.error.message },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Unexpected error." }, { status: 500 });
  }
}