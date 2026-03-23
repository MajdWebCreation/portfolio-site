import { Resend } from "resend";

type ContactPayload = {
  mode?: "contact" | "project_planner";
  locale?: "en" | "nl";
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message: string;
  website?: string;
  planner?: {
    projectTypeKey?: string;
    selectedProjectType?: string;
    recommendedPackage?: string;
    reason?: string;
    startingPrice?: string;
    indicativeRange?: string | null;
    selectedFeatures?: string[];
    selectedAddOns?: string[];
    pageCount?: string;
    brandingContentState?: string;
    smartScopeSelected?: boolean;
    webshopProducts?: string;
    customScopeSelected?: boolean;
    launchTimelineKey?: string;
    launchTimeline?: string;
    contentReadyKey?: string;
    contentReady?: string;
    brandingReadyKey?: string;
    brandingReady?: string;
    priorityKey?: string;
    priority?: string;
    notes?: string;
  };
};

type NormalizedSubmission = {
  mode: "contact" | "project_planner";
  locale: "en" | "nl";
  name: string;
  email: string;
  company: string;
  phone: string;
  message: string;
  website: string;
  planner?: ContactPayload["planner"];
};

type ValidationField =
  | "name"
  | "email"
  | "message"
  | "projectType"
  | "pageCount"
  | "smartScope"
  | "webshopProducts"
  | "customScope"
  | "launchTimeline"
  | "contentReady"
  | "brandingReady"
  | "priority";

type ValidationErrorMap = Partial<Record<ValidationField, string>>;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderEmailList(items: string[] | undefined, emptyLabel = "—") {
  if (!items?.length) {
    return `<li>${escapeHtml(emptyLabel)}</li>`;
  }

  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderTextList(items: string[] | undefined, emptyLabel = "—") {
  if (!items?.length) {
    return `- ${emptyLabel}`;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function normalizeSubmission(body: ContactPayload): NormalizedSubmission {
  return {
    mode: body.mode === "project_planner" ? "project_planner" : "contact",
    locale: body.locale === "nl" ? "nl" : "en",
    name: body.name?.trim() ?? "",
    email: body.email?.trim().toLowerCase() ?? "",
    company: body.company?.trim() ?? "",
    phone: body.phone?.trim() ?? "",
    message: body.message?.trim() ?? "",
    website: body.website?.trim() ?? "",
    planner: body.planner,
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getValidationMessage(locale: "en" | "nl", field: ValidationField) {
  const nl: Record<ValidationField, string> = {
    name: "Vul je naam in",
    email: "Vul een geldig e-mailadres in",
    message: "Je bericht is te kort",
    projectType: "Kies een projecttype",
    pageCount: "Maak een keuze voordat je doorgaat",
    smartScope: "Kies minimaal een relevante functie",
    webshopProducts: "Maak een keuze voordat je doorgaat",
    customScope: "Kies minimaal een relevante functie",
    launchTimeline: "Maak een keuze voordat je doorgaat",
    contentReady: "Maak een keuze voordat je doorgaat",
    brandingReady: "Maak een keuze voordat je doorgaat",
    priority: "Maak een keuze voordat je doorgaat",
  };

  const en: Record<ValidationField, string> = {
    name: "Enter your name",
    email: "Enter a valid email address",
    message: "Your message is too short",
    projectType: "Select a project type",
    pageCount: "Make a selection before continuing",
    smartScope: "Select at least one relevant option",
    webshopProducts: "Make a selection before continuing",
    customScope: "Select at least one relevant option",
    launchTimeline: "Make a selection before continuing",
    contentReady: "Make a selection before continuing",
    brandingReady: "Make a selection before continuing",
    priority: "Make a selection before continuing",
  };

  return (locale === "nl" ? nl : en)[field];
}

function validateSubmission(submission: NormalizedSubmission) {
  const errors: ValidationErrorMap = {};

  if (submission.name.length < 2) {
    errors.name = getValidationMessage(submission.locale, "name");
  }

  if (!submission.email || !isValidEmail(submission.email)) {
    errors.email = getValidationMessage(submission.locale, "email");
  }

  if (submission.mode === "contact") {
    if (submission.message.trim().length < 12) {
      errors.message = getValidationMessage(submission.locale, "message");
    }
    return errors;
  }

  const planner = submission.planner;

  if (!planner?.projectTypeKey) {
    errors.projectType = getValidationMessage(submission.locale, "projectType");
  }

  if (
    planner?.projectTypeKey === "starter" ||
    planner?.projectTypeKey === "business"
  ) {
    if (!planner.pageCount) {
      errors.pageCount = getValidationMessage(submission.locale, "pageCount");
    }
  }

  if (planner?.projectTypeKey === "smart" && !planner.smartScopeSelected) {
    errors.smartScope = getValidationMessage(submission.locale, "smartScope");
  }

  if (planner?.projectTypeKey === "webshop" && !planner.webshopProducts) {
    errors.webshopProducts = getValidationMessage(
      submission.locale,
      "webshopProducts",
    );
  }

  if (planner?.projectTypeKey === "platform" && !planner.customScopeSelected) {
    errors.customScope = getValidationMessage(submission.locale, "customScope");
  }

  if (!planner?.launchTimelineKey) {
    errors.launchTimeline = getValidationMessage(
      submission.locale,
      "launchTimeline",
    );
  }
  if (!planner?.contentReadyKey) {
    errors.contentReady = getValidationMessage(submission.locale, "contentReady");
  }
  if (!planner?.brandingReadyKey) {
    errors.brandingReady = getValidationMessage(
      submission.locale,
      "brandingReady",
    );
  }
  if (!planner?.priorityKey) {
    errors.priority = getValidationMessage(submission.locale, "priority");
  }

  return errors;
}

function buildPlannerCustomerEmail(params: {
  locale: "en" | "nl";
  name: string;
  planner?: ContactPayload["planner"];
}) {
  const { locale, name, planner } = params;
  const isNl = locale === "nl";
  const summaryTitle = isNl ? "Samenvatting van je aanvraag" : "Summary of your request";
  const introTitle = isNl
    ? "Bedankt voor je aanvraag"
    : "Thank you for your request";
  const introText = isNl
    ? `Hi ${escapeHtml(name)}, we hebben je Project Planner-aanvraag goed ontvangen. Hieronder vind je een compacte samenvatting van de gekozen richting en scope.`
    : `Hi ${escapeHtml(name)}, we received your Project Planner submission successfully. Below is a compact summary of the direction and scope you selected.`;
  const nextTitle = isNl ? "Wat gebeurt er nu?" : "What happens next?";
  const nextText = isNl
    ? "We bekijken je aanvraag, controleren de gekozen richting en komen binnenkort persoonlijk bij je terug met de volgende stap."
    : "We’ll review your request, check the proposed direction, and get back to you personally soon with the next step.";
  const pricingNote = isNl
    ? "De getoonde pricing blijft indicatief. De uiteindelijke offerte hangt af van de definitieve scope, complexiteit en projectreview."
    : "The shown pricing remains indicative. The final quote depends on the confirmed scope, complexity, and project review.";
  const noNotes = isNl ? "Geen extra notities meegestuurd." : "No extra notes provided.";
  const noScope = isNl ? "Nog geen extra scope geselecteerd." : "No additional scope selected.";
  const noAddOns = isNl ? "Nog geen relevante add-ons geselecteerd." : "No relevant add-ons selected.";

  const html = `
    <div style="margin:0;padding:0;background:#05070b;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
      <div style="max-width:680px;margin:0 auto;padding:32px 16px;">
        <div style="border:1px solid rgba(255,255,255,0.1);border-radius:24px;overflow:hidden;background:#07111a;">
          <div style="padding:32px 24px 24px;background:radial-gradient(circle at top, rgba(103,232,249,0.18), transparent 42%), #07111a;border-bottom:1px solid rgba(255,255,255,0.08);">
            <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.26em;text-transform:uppercase;color:rgba(103,232,249,0.88);">
              YM Creations
            </p>
            <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:700;color:#ffffff;">
              ${introTitle}
            </h1>
            <p style="margin:16px 0 0;font-size:15px;line-height:1.8;color:rgba(255,255,255,0.72);">
              ${introText}
            </p>
          </div>

          <div style="padding:24px;">
            <div style="padding:20px;border:1px solid rgba(255,255,255,0.08);border-radius:18px;background:rgba(255,255,255,0.03);">
              <p style="margin:0 0 16px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(103,232,249,0.82);">
                ${summaryTitle}
              </p>

              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 12px;vertical-align:top;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                    ${isNl ? "Projecttype" : "Project type"}
                  </td>
                  <td style="padding:0 0 12px;vertical-align:top;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.84);text-align:right;">
                    ${escapeHtml(planner?.selectedProjectType || "—")}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 12px;vertical-align:top;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                    ${isNl ? "Aanbevolen pakket" : "Recommended package"}
                  </td>
                  <td style="padding:0 0 12px;vertical-align:top;font-size:14px;line-height:1.7;color:#ffffff;text-align:right;">
                    ${escapeHtml(planner?.recommendedPackage || "—")}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 12px;vertical-align:top;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                    ${isNl ? "Startprijs" : "Starting price"}
                  </td>
                  <td style="padding:0 0 12px;vertical-align:top;font-size:14px;line-height:1.7;color:#ffffff;text-align:right;">
                    ${escapeHtml(planner?.startingPrice || "—")}
                  </td>
                </tr>
                ${
                  planner?.indicativeRange
                    ? `<tr>
                  <td style="padding:0 0 12px;vertical-align:top;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                    ${isNl ? "Indicatieve range" : "Indicative range"}
                  </td>
                  <td style="padding:0 0 12px;vertical-align:top;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.84);text-align:right;">
                    ${escapeHtml(planner.indicativeRange)}
                  </td>
                </tr>`
                    : ""
                }
                <tr>
                  <td style="padding:0;vertical-align:top;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                    ${isNl ? "Planning" : "Timeline"}
                  </td>
                  <td style="padding:0;vertical-align:top;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.84);text-align:right;">
                    ${escapeHtml(planner?.launchTimeline || "—")}
                  </td>
                </tr>
              </table>
            </div>

            <div style="margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                ${isNl ? "Waarom dit past" : "Why this fits"}
              </p>
              <p style="margin:0;font-size:14px;line-height:1.9;color:rgba(255,255,255,0.72);">
                ${escapeHtml(planner?.reason || "—")}
              </p>
            </div>

            <div style="margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                ${isNl ? "Geselecteerde scope" : "Selected scope"}
              </p>
              <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.9;color:rgba(255,255,255,0.72);">
                ${renderEmailList(planner?.selectedFeatures, noScope)}
              </ul>
            </div>

            <div style="margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                ${isNl ? "Relevante add-ons" : "Relevant add-ons"}
              </p>
              <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.9;color:rgba(255,255,255,0.72);">
                ${renderEmailList(planner?.selectedAddOns, noAddOns)}
              </ul>
            </div>

            <div style="margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);">
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 10px;vertical-align:top;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                    ${isNl ? "Content" : "Content"}
                  </td>
                  <td style="padding:0 0 10px;vertical-align:top;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.84);text-align:right;">
                    ${escapeHtml(planner?.contentReady || "—")}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 10px;vertical-align:top;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                    ${isNl ? "Branding" : "Branding"}
                  </td>
                  <td style="padding:0 0 10px;vertical-align:top;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.84);text-align:right;">
                    ${escapeHtml(planner?.brandingReady || "—")}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;vertical-align:top;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                    ${isNl ? "Focus" : "Priority"}
                  </td>
                  <td style="padding:0;vertical-align:top;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.84);text-align:right;">
                    ${escapeHtml(planner?.priority || "—")}
                  </td>
                </tr>
              </table>
            </div>

            <div style="margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.42);">
                ${isNl ? "Extra notities" : "Additional notes"}
              </p>
              <p style="margin:0;font-size:14px;line-height:1.9;color:rgba(255,255,255,0.72);white-space:pre-wrap;">
                ${escapeHtml(planner?.notes || noNotes)}
              </p>
            </div>

            <div style="margin-top:22px;padding:18px 20px;border:1px solid rgba(255,255,255,0.08);border-radius:18px;background:rgba(255,255,255,0.02);">
              <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(103,232,249,0.82);">
                ${nextTitle}
              </p>
              <p style="margin:0;font-size:14px;line-height:1.9;color:rgba(255,255,255,0.72);">
                ${nextText}
              </p>
              <p style="margin:12px 0 0;font-size:13px;line-height:1.8;color:rgba(255,255,255,0.54);">
                ${pricingNote}
              </p>
            </div>
          </div>

          <div style="padding:18px 24px;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;line-height:1.8;color:rgba(255,255,255,0.44);">
            YM Creations<br />
            Premium web design & development<br />
            ymcreations.com
          </div>
        </div>
      </div>
    </div>
  `;

  const text = `
${isNl ? `Hi ${name},` : `Hi ${name},`}

${isNl
  ? "Bedankt voor je aanvraag. We hebben je Project Planner-aanvraag goed ontvangen."
  : "Thank you for your request. We received your Project Planner submission successfully."}

${isNl
  ? "Hieronder vind je een samenvatting van de gekozen richting en scope:"
  : "Below is a summary of the direction and scope you selected:"}

${isNl ? "Projecttype" : "Project type"}: ${planner?.selectedProjectType || "—"}
${isNl ? "Aanbevolen pakket" : "Recommended package"}: ${planner?.recommendedPackage || "—"}
${isNl ? "Waarom dit past" : "Why this fits"}: ${planner?.reason || "—"}
${isNl ? "Startprijs" : "Starting price"}: ${planner?.startingPrice || "—"}
${planner?.indicativeRange ? `${isNl ? "Indicatieve range" : "Indicative range"}: ${planner.indicativeRange}` : ""}
${isNl ? "Planning" : "Timeline"}: ${planner?.launchTimeline || "—"}
${isNl ? "Content" : "Content"}: ${planner?.contentReady || "—"}
${isNl ? "Branding" : "Branding"}: ${planner?.brandingReady || "—"}
${isNl ? "Focus" : "Priority"}: ${planner?.priority || "—"}

${isNl ? "Geselecteerde scope" : "Selected scope"}:
${renderTextList(planner?.selectedFeatures, noScope)}

${isNl ? "Relevante add-ons" : "Relevant add-ons"}:
${renderTextList(planner?.selectedAddOns, noAddOns)}

${isNl ? "Extra notities" : "Additional notes"}:
${planner?.notes || noNotes}

${nextText}
${pricingNote}

YM Creations
ymcreations.com
  `.trim();

  return { html, text };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ContactPayload;
    const {
      name,
      email,
      company,
      phone,
      message,
      website,
      mode,
      locale,
      planner,
    } = normalizeSubmission(body);

    if (website) {
      return Response.json({ ok: true });
    }

    const validationErrors = validateSubmission({
      name,
      email,
      company,
      phone,
      message,
      website,
      mode,
      locale,
      planner,
    });

    if (Object.keys(validationErrors).length > 0) {
      return Response.json(
        {
          error:
            locale === "nl"
              ? "Controleer de verplichte velden en probeer opnieuw."
              : "Check the required fields and try again.",
          fieldErrors: validationErrors,
        },
        { status: 400 }
      );
    }

    const to = process.env.CONTACT_TO_EMAIL;
    const from = process.env.CONTACT_FROM_EMAIL;
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!to || !from || !resendApiKey) {
      return Response.json(
        { error: "Missing mail configuration." },
        { status: 500 }
      );
    }

    const resend = new Resend(resendApiKey);

    const adminSubject =
      mode === "project_planner"
        ? locale === "nl"
          ? `Nieuwe Project Planner aanvraag — ${planner?.recommendedPackage || "Onbekend pakket"}`
          : `New Project Planner inquiry — ${planner?.recommendedPackage || "Unknown package"}`
        : `New website inquiry from ${name}`;

    const plannerHtml =
      mode === "project_planner"
        ? `
      <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;" />
      <h3 style="margin:0 0 16px;">Project Planner summary</h3>
      <p><strong>Selected project type:</strong> ${escapeHtml(planner?.selectedProjectType || "—")}</p>
      <p><strong>Recommended package:</strong> ${escapeHtml(planner?.recommendedPackage || "—")}</p>
      <p><strong>Reason:</strong> ${escapeHtml(planner?.reason || "—")}</p>
      <p><strong>Starting price:</strong> ${escapeHtml(planner?.startingPrice || "—")}</p>
      <p><strong>Indicative range:</strong> ${escapeHtml(planner?.indicativeRange || "—")}</p>
      <p><strong>Launch timeline:</strong> ${escapeHtml(planner?.launchTimeline || "—")}</p>
      <p><strong>Content readiness:</strong> ${escapeHtml(planner?.contentReady || "—")}</p>
      <p><strong>Branding readiness:</strong> ${escapeHtml(planner?.brandingReady || "—")}</p>
      <p><strong>Priority:</strong> ${escapeHtml(planner?.priority || "—")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(phone || "—")}</p>
      <p><strong>Selected scope:</strong></p>
      <ul>
        ${(planner?.selectedFeatures ?? [])
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("") || "<li>—</li>"}
      </ul>
      <p><strong>Relevant add-ons:</strong></p>
      <ul>
        ${(planner?.selectedAddOns ?? [])
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("") || "<li>—</li>"}
      </ul>
    `
        : "";

    const adminHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111827;">
        <h2 style="margin:0 0 20px;">${
          mode === "project_planner"
            ? "New Project Planner submission"
            : "New contact form submission"
        }</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Company:</strong> ${escapeHtml(company || "—")}</p>
        ${
          mode === "project_planner"
            ? `<p><strong>Phone:</strong> ${escapeHtml(phone || "—")}</p>`
            : ""
        }
        <p><strong>Message:</strong></p>
        <div style="margin-top:8px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;white-space:pre-wrap;">${escapeHtml(
          message
        )}</div>
        ${plannerHtml}
      </div>
    `;

    const plannerText =
      mode === "project_planner"
        ? `

Project Planner summary

Selected project type: ${planner?.selectedProjectType || "—"}
Recommended package: ${planner?.recommendedPackage || "—"}
Reason: ${planner?.reason || "—"}
Starting price: ${planner?.startingPrice || "—"}
Indicative range: ${planner?.indicativeRange || "—"}
Launch timeline: ${planner?.launchTimeline || "—"}
Content readiness: ${planner?.contentReady || "—"}
Branding readiness: ${planner?.brandingReady || "—"}
Priority: ${planner?.priority || "—"}
Phone: ${phone || "—"}

Selected scope:
${(planner?.selectedFeatures ?? []).map((item) => `- ${item}`).join("\n") || "- —"}

Relevant add-ons:
${(planner?.selectedAddOns ?? []).map((item) => `- ${item}`).join("\n") || "- —"}
        `.trim()
        : "";

    const adminText = `
${
  mode === "project_planner"
    ? "New Project Planner submission"
    : "New contact form submission"
}

Name: ${name}
Email: ${email}
Company: ${company || "—"}
${mode === "project_planner" ? `Phone: ${phone || "—"}` : ""}

Message:
${message}

${plannerText}
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
      console.error("Admin email failed", {
        mode,
        locale,
        recipient: to,
        customerEmail: email,
        error: adminResult.error,
      });
      return Response.json({ error: adminResult.error.message }, { status: 500 });
    }

    const autoReplySubject =
      mode === "project_planner"
        ? locale === "nl"
          ? "We hebben je projectaanvraag ontvangen — YM Creations"
          : "We received your project request — YM Creations"
        : "We received your message — YM Creations";

    const defaultAutoReplyHtml = `
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
                ${
                  mode === "project_planner"
                    ? "We’ll review the scope, sanity-check the recommendation, and reply personally from <span style=\"color:#ffffff;\">contact@ymcreations.com</span>."
                    : "We’ll review your inquiry and reply personally from <span style=\"color:#ffffff;\">contact@ymcreations.com</span>."
                }
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

    const defaultAutoReplyText = `
${locale === "nl" ? `Hoi ${name},` : `Hi ${name},`}

${mode === "project_planner"
  ? locale === "nl"
    ? "Bedankt voor je Project Planner aanvraag bij YM Creations.\nWe hebben je scope ontvangen en komen zo snel mogelijk bij je terug."
    : "Thanks for your Project Planner inquiry at YM Creations.\nWe received your scope successfully and will get back to you as soon as possible."
  : `Thanks for reaching out to YM Creations.
We received your message successfully and will get back to you as soon as possible.`}

Your message:
${message}

YM Creations
contact@ymcreations.com
ymcreations.com
    `.trim();

    const plannerCustomerEmail =
      mode === "project_planner"
        ? buildPlannerCustomerEmail({ locale, name, planner })
        : null;

    const autoReplyHtml = plannerCustomerEmail?.html ?? defaultAutoReplyHtml;
    const autoReplyText = plannerCustomerEmail?.text ?? defaultAutoReplyText;

    const autoReplyResult = await resend.emails.send({
      from,
      to: email,
      subject: autoReplySubject,
      html: autoReplyHtml,
      text: autoReplyText,
    });

    if (autoReplyResult.error) {
      console.error("Customer confirmation email failed", {
        mode,
        locale,
        customerEmail: email,
        error: autoReplyResult.error,
      });
      return Response.json(
        { error: autoReplyResult.error.message },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Unexpected contact route error", error);
    return Response.json({ error: "Unexpected error." }, { status: 500 });
  }
}
