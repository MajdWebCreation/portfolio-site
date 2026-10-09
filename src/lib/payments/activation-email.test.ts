import { describe, expect, it } from "vitest";
import { buildDocumentMailBody } from "@/lib/admin/documents/email";
import { activationButtonLabel, activationMailSubject, buildActivationMail } from "@/lib/payments/activation-email";

/*
  The direct debit activation mail: the same YM sheet as the invoice mail, and
  copy that leaves no doubt the cent records a mandate and pays nothing.

  Amounts are compared with the spaces normalised: Intl puts a non-breaking
  space after the euro sign.
*/
const flat = (value: string) => value.replace(/ /g, " ");

const url = "https://payment-links.mollie.com/payment/AbC123";
const mail = buildActivationMail({
  contactName: "Y. Flexora",
  services: [{ name: "Websitebeheer & hosting", monthlyGrossCents: 1210 }],
  activationUrl: url,
});
const html = flat(mail.html);
const text = flat(mail.text);

/* The invoice mail, for what the two must share. */
const invoice = buildDocumentMailBody({
  kind: "invoice",
  number: "YM-F-2026-000001",
  contactName: "A. Alfa",
  issueDateLabel: "13 sep 2026",
  deadlineLabel: "27 sep 2026",
  totalLabel: "€ 121,00",
  pdf: new Uint8Array(),
  fileName: "YM-F-2026-000001.pdf",
  payUrl: "https://payment-link.mollie.com/payment/pl_1",
});

describe("the activation mail", () => {
  it("has the requested subject and heading", () => {
    expect(mail.subject).toBe("Automatische incasso activeren | YM Creations");
    expect(activationMailSubject).toBe(mail.subject);
    expect(html).toContain(">Automatische incasso activeren</h1>");
  });

  it("greets the contact personally, in both renderings", () => {
    expect(html).toContain("Beste Y. Flexora,");
    expect(text.startsWith("Beste Y. Flexora,")).toBe(true);
  });

  it("falls back to a neutral greeting without a contact name", () => {
    const anonymous = buildActivationMail({ contactName: "  ", services: [], activationUrl: url });
    expect(anonymous.text.startsWith("Beste klant,")).toBe(true);
  });

  it("says it is a one-time activation of exactly € 0,01, only to record the mandate", () => {
    for (const body of [html, text]) {
      expect(body).toContain("Dat doe je één keer, met een betaling van € 0,01.");
      expect(body).toContain("Dit bedrag legt alleen je machtiging voor toekomstige automatische incasso vast.");
      expect(body).toContain("Het is geen betaling van een factuur of maandtermijn en wordt nergens mee verrekend.");
    }
  });

  it("carries the compact activation block", () => {
    expect(html).toContain("Eenmalige activatie");
    expect(html).toContain(">Bedrag</td>");
    expect(html).toContain(">€ 0,01</td>");
    expect(html).toContain("Je betaalt via de beveiligde betaalomgeving van Mollie.");
    expect(text).toContain("Eenmalige activatie\nBedrag: € 0,01\nJe betaalt via de beveiligde betaalomgeving van Mollie.");
  });

  it("has exactly one primary button, to the absolute Mollie link", () => {
    expect(activationButtonLabel).toBe("Automatische incasso activeren");
    expect(html.match(/background:#14161a/g)).toHaveLength(1);
    expect(html).toContain(`<a href="${url}" style="display:inline-block;padding:13px 22px;`);
    expect(html).toContain(">Automatische incasso activeren</a>");
    expect(text).toContain(`Automatische incasso activeren: ${url}`);
  });

  it("says what follows: the monthly terms, announced in advance", () => {
    expect(html).toContain(
      "De maandtermijnen voor Websitebeheer &amp; hosting (€ 12,10 per maand incl. btw) kunnen dan automatisch worden geïncasseerd.",
    );
    expect(text).toContain(
      "De maandtermijnen voor Websitebeheer & hosting (€ 12,10 per maand incl. btw) kunnen dan automatisch worden geïncasseerd.",
    );
    for (const body of [html, text]) {
      expect(body).toContain("Vóór elke afschrijving ontvang je de factuur, minstens 14 dagen van tevoren.");
    }
  });

  it("never reads as paying an invoice or a term", () => {
    for (const body of [html, text]) {
      expect(body).not.toMatch(/factuur betalen/i);
      expect(body).not.toMatch(/betaal (je|uw) (factuur|termijn)/i);
      expect(body).not.toContain("eerste termijn");
    }
  });

  it("speaks to the customer as je throughout, the contact block included", () => {
    for (const body of [html, text]) {
      expect(body).not.toMatch(/\bu\b|\buw\b|Heeft u/);
      expect(body).toContain("Vragen over de incasso? Reageer gerust op deze mail, of bereik ons hieronder.");
    }
  });

  it("closes the way YM Creations mails close", () => {
    expect(html).toContain("Met vriendelijke groet,");
    expect(text).toContain("Met vriendelijke groet,\nYM Creations\nymcreations.com");
  });

  it("escapes everything that comes from a record", () => {
    const hostile = buildActivationMail({
      contactName: `<script>alert("x")</script>`,
      services: [{ name: `<b>SEO</b> & "meer"`, monthlyGrossCents: 6050 }],
      activationUrl: url,
    });
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).not.toContain("<b>SEO</b>");
    expect(hostile.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(hostile.html).toContain("&lt;b&gt;SEO&lt;/b&gt; &amp; &quot;meer&quot;");
  });

  it("refuses a link that is not an absolute https URL", () => {
    for (const bad of ["/nl/incasso", "http://payment-links.mollie.com/x", "javascript:alert(1)", `https://x.test/"onclick`]) {
      expect(() => buildActivationMail({ contactName: "A", services: [], activationUrl: bad })).toThrow();
    }
  });

  /* The only link to Mollie is the one we were given: a link id, nothing about the customer. */
  it("puts nothing about the customer in the activation link", () => {
    const links = [...mail.html.matchAll(/href="(https:\/\/payment-links\.mollie\.com[^"]*)"/g)].map((match) => match[1]);
    expect(links).toEqual([url]);
    expect(links[0]).not.toMatch(/Flexora|cust-|@|%40/);
  });
});

/*
  The house style, compared with the invoice mail rather than described: the
  same letterhead, the same footer, the same sheet and the same button.
*/
describe("the activation mail beside the invoice mail", () => {
  const between = (body: string, start: string, end: string) => body.slice(body.indexOf(start), body.indexOf(end, body.indexOf(start)));

  it("uses the same letterhead, sheet, footer and button shape", () => {
    const letterhead = '<p style="font-family:SFMono-Regular';
    expect(between(mail.html, letterhead, "<h1")).toBe(between(invoice.html, letterhead, "<h1"));
    const footer = "YM Creations<br />";
    expect(between(mail.html, footer, "</td>")).toBe(between(invoice.html, footer, "</td>"));
    expect(mail.html).toContain("max-width:560px");
    expect(mail.html).toContain('bgcolor="#f4f3ee"');
    expect(mail.html).not.toMatch(/gradient/i);
    expect(between(mail.html, "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:26px", "<a ")).toBe(
      between(invoice.html, "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:26px", "<a "),
    );
  });
});
