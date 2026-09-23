import { Resend } from "resend";
import { validateAttribution } from "@/lib/attribution/classify";
import { storeInquiry } from "@/lib/contact/inquiry";
import type { ContactMode, ContactPayload } from "@/lib/contact/payload";
import { normalizeWebsiteUrl, websiteUrlHost } from "@/lib/contact/website-url";
import {
  emailLink,
  emailList,
  emailMeta,
  emailPanel,
  emailSection,
  emailDivider,
  emailShell,
  emailText,
  escapeEmailHtml as escapeHtml,
} from "@/lib/email/shell";

type NormalizedSubmission = {
  mode: ContactMode;
  locale: "en" | "nl";
  name: string;
  email: string;
  company: string;
  phone: string;
  message: string;
  website: string;
  /** The websitecheck address, normalised; empty when missing or not a website address. */
  websiteUrl: string;
  planner?: ContactPayload["planner"];
};

type ValidationField =
  | "name"
  | "email"
  | "phone"
  | "websiteUrl"
  | "message"
  | "projectType"
  | "pageCount"
  | "multilingual"
  | "smartScope"
  | "webshopProducts"
  | "customScope"
  | "launchTimeline"
  | "contentReady"
  | "brandingReady"
  | "priority"
  | "businessDeclaration";

type ValidationErrorMap = Partial<Record<ValidationField, string>>;

function renderEmailList(items: string[] | undefined, emptyLabel = "—") {
  return emailList(items ?? [], emptyLabel);
}

function renderTextList(items: string[] | undefined, emptyLabel = "—") {
  if (!items?.length) {
    return `- ${emptyLabel}`;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function normalizeMode(mode: unknown): ContactMode {
  return mode === "project_planner" || mode === "websitecheck" ? mode : "contact";
}

/* Digits with the separators people type; six to thirty characters. Not a phone parser, a sanity bound. */
const phonePattern = /^\+?[0-9][0-9 ()./-]{5,29}$/;

function normalizeSubmission(body: ContactPayload): NormalizedSubmission {
  const mode = normalizeMode(body.mode);
  return {
    mode,
    locale: body.locale === "nl" ? "nl" : "en",
    name: body.name?.trim() ?? "",
    email: body.email?.trim().toLowerCase() ?? "",
    company: body.company?.trim() ?? "",
    phone: body.phone?.trim() ?? "",
    /* A websitecheck has no message: whatever a client put there is not kept. */
    message: mode === "websitecheck" ? "" : (body.message?.trim() ?? ""),
    website: body.website?.trim() ?? "",
    websiteUrl: mode === "websitecheck" ? (normalizeWebsiteUrl(body.websiteUrl) ?? "") : "",
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
    phone: "Controleer je telefoonnummer",
    websiteUrl: "Vul het adres van je website in, bijvoorbeeld www.jouwbedrijf.nl",
    message: "Je bericht is te kort",
    projectType: "Kies een projecttype",
    pageCount: "Maak een keuze voordat je doorgaat",
    multilingual: "Maak een keuze voordat je doorgaat",
    smartScope: "Kies minimaal een relevante functie",
    webshopProducts: "Maak een keuze voordat je doorgaat",
    customScope: "Kies minimaal een relevante functie",
    launchTimeline: "Maak een keuze voordat je doorgaat",
    contentReady: "Maak een keuze voordat je doorgaat",
    brandingReady: "Maak een keuze voordat je doorgaat",
    priority: "Maak een keuze voordat je doorgaat",
    businessDeclaration: "Bevestig dat je deze aanvraag zakelijk doet",
  };

  const en: Record<ValidationField, string> = {
    name: "Enter your name",
    email: "Enter a valid email address",
    phone: "Check your phone number",
    websiteUrl: "Enter your website address, for example www.yourcompany.com",
    message: "Your message is too short",
    projectType: "Select a project type",
    pageCount: "Make a selection before continuing",
    multilingual: "Make a selection before continuing",
    smartScope: "Select at least one relevant option",
    webshopProducts: "Make a selection before continuing",
    customScope: "Select at least one relevant option",
    launchTimeline: "Make a selection before continuing",
    contentReady: "Make a selection before continuing",
    brandingReady: "Make a selection before continuing",
    priority: "Make a selection before continuing",
    businessDeclaration: "Confirm that this is a business request",
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

  if (submission.mode === "websitecheck") {
    if (!submission.websiteUrl) {
      errors.websiteUrl = getValidationMessage(submission.locale, "websiteUrl");
    }
    if (submission.phone && !phonePattern.test(submission.phone)) {
      errors.phone = getValidationMessage(submission.locale, "phone");
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
    if (!planner.multilingualKey) {
      errors.multilingual = getValidationMessage(
        submission.locale,
        "multilingual",
      );
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
  if (planner?.businessDeclaration !== true) {
    errors.businessDeclaration = getValidationMessage(
      submission.locale,
      "businessDeclaration",
    );
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

  const html = emailShell({
    locale,
    title: introTitle,
    preheader: `${planner?.recommendedPackage || ""} ${planner?.startingPrice || ""}`.trim(),
    content: [
      emailText(introText, { top: 18 }),
      emailMeta(
        [
          { label: isNl ? "Projecttype" : "Project type", value: planner?.selectedProjectType || "—" },
          { label: isNl ? "Aanbevolen pakket" : "Recommended package", value: planner?.recommendedPackage || "—" },
          { label: isNl ? "Eenmalig, vanaf" : "One-off, from", value: planner?.startingPrice || "—" },
          { label: isNl ? "Technisch beheer" : "Technical management", value: planner?.monthlyManagement || "—" },
          ...(planner?.indicativeRange
            ? [{ label: isNl ? "Indicatieve range" : "Indicative range", value: planner.indicativeRange }]
            : []),
          { label: isNl ? "Planning" : "Timeline", value: planner?.launchTimeline || "—" },
        ],
        { label: summaryTitle },
      ),
      emailSection({
        label: isNl ? "Waarom dit past" : "Why this fits",
        html: escapeHtml(planner?.reason || "—"),
      }),
      emailSection({
        label: isNl ? "Geselecteerde scope" : "Selected scope",
        html: renderEmailList(planner?.selectedFeatures, noScope),
      }),
      emailSection({
        label: isNl ? "Relevante add-ons" : "Relevant add-ons",
        html: renderEmailList(planner?.selectedAddOns, noAddOns),
      }),
      emailMeta([
        { label: isNl ? "Content" : "Content", value: planner?.contentReady || "—" },
        { label: isNl ? "Branding" : "Branding", value: planner?.brandingReady || "—" },
        { label: isNl ? "Focus" : "Priority", value: planner?.priority || "—" },
      ]),
      emailSection({
        label: isNl ? "Extra notities" : "Additional notes",
        html: escapeHtml(planner?.notes || noNotes),
      }),
      emailDivider(),
      emailPanel({ label: nextTitle, html: `${escapeHtml(nextText)}<br /><br />${escapeHtml(pricingNote)}` }),
    ].join(""),
  });

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
${isNl ? "Eenmalig, vanaf" : "One-off, from"}: ${planner?.startingPrice || "—"}
${isNl ? "Technisch beheer" : "Technical management"}: ${planner?.monthlyManagement || "—"}
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

/**
 * The confirmation a websitecheck requester receives. It repeats the two
 * things that matter to them: which site will be looked at, and that nothing
 * is owed for it. No response time is promised for the check itself.
 */
function buildWebsitecheckCustomerEmail(params: { locale: "en" | "nl"; name: string; websiteUrl: string }) {
  const { locale, name, websiteUrl } = params;
  const isNl = locale === "nl";
  const host = websiteUrlHost(websiteUrl);
  const title = isNl ? "Je websitecheck-aanvraag is ontvangen" : "Your website check request has been received";
  const intro = isNl
    ? `Hi ${escapeHtml(name)}, bedankt voor je aanvraag. We bekijken ${escapeHtml(host)} persoonlijk en sturen je de bevindingen per e-mail op dit adres.`
    : `Hi ${escapeHtml(name)}, thank you for your request. We will look at ${escapeHtml(host)} personally and send you our findings by email at this address.`;
  const nextTitle = isNl ? "Wat gebeurt er nu?" : "What happens next?";
  const nextText = isNl
    ? "Iemand van YM Creations loopt door je website op eerste indruk, gebruik op mobiel, duidelijkheid, techniek en snelheid, vertrouwen en structuur. Je ontvangt een korte beoordeling in gewone taal: wat goed is, wat beter kan en wat het meest de moeite waard is om eerst op te pakken."
    : "Someone at YM Creations goes through your website on first impression, mobile use, clarity, technical quality and speed, trust and structure. You receive a short assessment in plain language: what works, what could be better and what is most worth addressing first.";
  const freeTitle = isNl ? "Gratis en vrijblijvend" : "Free and without obligation";
  const freeText = isNl
    ? "De websitecheck kost niets en verplicht je tot niets. Wil je daarna iets laten verbeteren of opnieuw laten bouwen, dan bespreken we dat pas als jij dat wilt."
    : "The website check costs nothing and commits you to nothing. If you want something improved or rebuilt afterwards, we discuss that only when you want to.";

  const html = emailShell({
    locale,
    title,
    preheader: isNl ? `We bekijken ${host} persoonlijk.` : `We will look at ${host} personally.`,
    content: [
      emailText(intro, { top: 18 }),
      emailMeta([{ label: "Website", value: websiteUrl }]),
      emailSection({ label: nextTitle, html: escapeHtml(nextText) }),
      emailDivider(),
      emailPanel({ label: freeTitle, html: escapeHtml(freeText) }),
    ].join(""),
  });

  const text = `
${isNl ? `Hi ${name},` : `Hi ${name},`}

${isNl
  ? `Bedankt voor je aanvraag. We bekijken ${host} persoonlijk en sturen je de bevindingen per e-mail op dit adres.`
  : `Thank you for your request. We will look at ${host} personally and send you our findings by email at this address.`}

Website: ${websiteUrl}

${nextTitle}
${nextText}

${freeTitle}
${freeText}

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
      websiteUrl,
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
      websiteUrl,
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

    /*
      Where the visit came from, as the browser reported it. Checked here
      against the same rules the browser used; a value that does not fit
      exactly is dropped as a whole and the request is stored without one.
      Never logged: whatever a client put in there is not ours to keep.
    */
    const attribution = validateAttribution(body.attribution);

    // Stored before anything is sent, and a failure here is reported as a
    // failure: a visitor must never be told the request came through when
    // there is no record of it. The mail below is the notification, not the
    // record.
    try {
      await storeInquiry({ origin: mode, locale, name, email, company, message, phone, planner, websiteUrl, attribution });
    } catch (error) {
      // No visitor data in the log line: Vercel keeps these, and an address
      // does not help anyone read the failure.
      console.error("Storing inquiry failed", { mode, locale, error });
      return Response.json(
        {
          error:
            locale === "nl"
              ? "We konden je aanvraag niet opslaan. Probeer het opnieuw."
              : "We could not save your request. Please try again.",
        },
        { status: 500 }
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
        : mode === "websitecheck"
          ? `Nieuwe websitecheck-aanvraag — ${websiteUrlHost(websiteUrl)}`
          : `New website inquiry from ${name}`;

    const adminHeading =
      mode === "project_planner"
        ? "New Project Planner submission"
        : mode === "websitecheck"
          ? "New websitecheck request"
          : "New contact form submission";

    const websitecheckHtml =
      mode === "websitecheck"
        ? `
        <p><strong>Website:</strong> <a href="${escapeHtml(websiteUrl)}">${escapeHtml(websiteUrl)}</a></p>
        <p><strong>Phone:</strong> ${escapeHtml(phone || "—")}</p>
      `
        : "";

    const plannerHtml =
      mode === "project_planner"
        ? `
      <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;" />
      <h3 style="margin:0 0 16px;">Project Planner summary</h3>
      <p><strong>Selected project type:</strong> ${escapeHtml(planner?.selectedProjectType || "—")}</p>
      <p><strong>Recommended package:</strong> ${escapeHtml(planner?.recommendedPackage || "—")}</p>
      <p><strong>Reason:</strong> ${escapeHtml(planner?.reason || "—")}</p>
      <p><strong>Starting price:</strong> ${escapeHtml(planner?.startingPrice || "—")}</p>
      <p><strong>Technical management:</strong> ${escapeHtml(planner?.monthlyManagement || "—")}</p>
      <p><strong>Indicative range:</strong> ${escapeHtml(planner?.indicativeRange || "—")}</p>
      <p><strong>Launch timeline:</strong> ${escapeHtml(planner?.launchTimeline || "—")}</p>
      <p><strong>Content readiness:</strong> ${escapeHtml(planner?.contentReady || "—")}</p>
      <p><strong>Branding readiness:</strong> ${escapeHtml(planner?.brandingReady || "—")}</p>
      <p><strong>Priority:</strong> ${escapeHtml(planner?.priority || "—")}</p>
      <p><strong>Business declaration:</strong> ${planner?.businessDeclaration ? "Yes" : "No"}</p>
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
        <h2 style="margin:0 0 20px;">${adminHeading}</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Company:</strong> ${escapeHtml(company || "—")}</p>
        ${
          mode === "project_planner"
            ? `<p><strong>Phone:</strong> ${escapeHtml(phone || "—")}</p>`
            : ""
        }
        ${websitecheckHtml}
        ${
          mode === "websitecheck"
            ? ""
            : `<p><strong>Message:</strong></p>
        <div style="margin-top:8px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;white-space:pre-wrap;">${escapeHtml(
          message
        )}</div>`
        }
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
Technical management: ${planner?.monthlyManagement || "—"}
Indicative range: ${planner?.indicativeRange || "—"}
Launch timeline: ${planner?.launchTimeline || "—"}
Content readiness: ${planner?.contentReady || "—"}
Branding readiness: ${planner?.brandingReady || "—"}
Priority: ${planner?.priority || "—"}
Business declaration: ${planner?.businessDeclaration ? "Yes" : "No"}
Phone: ${phone || "—"}

Selected scope:
${(planner?.selectedFeatures ?? []).map((item) => `- ${item}`).join("\n") || "- —"}

Relevant add-ons:
${(planner?.selectedAddOns ?? []).map((item) => `- ${item}`).join("\n") || "- —"}
        `.trim()
        : "";

    const adminText = `
${adminHeading}

Name: ${name}
Email: ${email}
Company: ${company || "—"}
${mode === "project_planner" || mode === "websitecheck" ? `Phone: ${phone || "—"}` : ""}
${mode === "websitecheck" ? `Website: ${websiteUrl}` : `
Message:
${message}`}

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
      console.error("Admin email failed", { mode, locale, error: adminResult.error });
      return Response.json({ error: adminResult.error.message }, { status: 500 });
    }

    const autoReplySubject =
      mode === "project_planner"
        ? locale === "nl"
          ? "We hebben je projectaanvraag ontvangen — YM Creations"
          : "We received your project request — YM Creations"
        : mode === "websitecheck"
          ? locale === "nl"
            ? "We hebben je websitecheck-aanvraag ontvangen — YM Creations"
            : "We received your website check request — YM Creations"
        : locale === "nl"
          ? "Je bericht is ontvangen — YM Creations"
          : "We received your message — YM Creations";

    /*
      The contact confirmation. Same content and flow as before, in the shared
      light shell; the body now follows the visitor's locale, the way the rest
      of this route already does.
    */
    const isNl = locale === "nl";
    const contactAddress = "contact@ymcreations.com";

    const defaultAutoReplyHtml = emailShell({
      locale,
      title: isNl ? "Bericht ontvangen" : "Message received",
      preheader: isNl
        ? "We hebben je bericht ontvangen en nemen snel contact op."
        : "We received your message and will be in touch soon.",
      content: [
        emailText(
          isNl
            ? `Beste ${escapeHtml(name)},`
            : `Hi ${escapeHtml(name)},`,
          { top: 18 },
        ),
        emailText(
          isNl
            ? "Bedankt voor je bericht. We hebben je aanvraag goed ontvangen en nemen zo snel mogelijk persoonlijk contact met je op."
            : "Thanks for your message. We received your request and will get back to you personally as soon as possible.",
        ),
        emailPanel({
          label: isNl ? "Jouw bericht" : "Your message",
          html: escapeHtml(message),
          preserveLineBreaks: true,
        }),
        emailSection({
          label: isNl ? "Wat gebeurt er nu?" : "What happens next?",
          html: isNl
            ? `We bekijken je aanvraag en reageren persoonlijk via ${emailLink(`mailto:${contactAddress}`, contactAddress)}.`
            : `We review your request and reply personally from ${emailLink(`mailto:${contactAddress}`, contactAddress)}.`,
        }),
      ].join(""),
    });


    // Plain-text counterpart of the same mail, in the same language.
    const defaultAutoReplyText = `
${isNl ? `Beste ${name},` : `Hi ${name},`}

${isNl
  ? "Bedankt voor je bericht. We hebben je aanvraag goed ontvangen en nemen zo snel mogelijk persoonlijk contact met je op."
  : "Thanks for your message. We received your request and will get back to you personally as soon as possible."}

${isNl ? "Jouw bericht:" : "Your message:"}
${message}

${isNl ? "Wat gebeurt er nu?" : "What happens next?"}
${isNl
  ? `We bekijken je aanvraag en reageren persoonlijk via ${contactAddress}.`
  : `We review your request and reply personally from ${contactAddress}.`}

YM Creations
${contactAddress}
+31 6 53 40 02 20
ymcreations.com
    `.trim();

    const customerEmail =
      mode === "project_planner"
        ? buildPlannerCustomerEmail({ locale, name, planner })
        : mode === "websitecheck"
          ? buildWebsitecheckCustomerEmail({ locale, name, websiteUrl })
          : null;

    const autoReplyHtml = customerEmail?.html ?? defaultAutoReplyHtml;
    const autoReplyText = customerEmail?.text ?? defaultAutoReplyText;

    const autoReplyResult = await resend.emails.send({
      from,
      to: email,
      subject: autoReplySubject,
      html: autoReplyHtml,
      text: autoReplyText,
    });

    if (autoReplyResult.error) {
      console.error("Customer confirmation email failed", { mode, locale, error: autoReplyResult.error });
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
