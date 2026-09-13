import { describe, expect, it } from "vitest";
import { buildDocumentMailBody, invoiceSubject } from "@/lib/admin/documents/email";

/*
  The mail for a one-off invoice that also authorises the monthly collection.
  Paying it does two things, so the mail has to say both -- and it has to keep
  the two amounts apart, because only one of them is being collected today.

  Amounts are compared with the spaces normalised: Intl puts a non-breaking
  space after the euro sign, which is right in a mail and unreadable in an
  assertion.
*/
const flat = (value: string) => value.replace(/ /g, " ");

const base = {
  kind: "invoice" as const,
  number: "YM-F-2026-000001",
  recipientEmail: "a@example.com",
  contactName: "A. Alfa",
  issueDateLabel: "13 sep 2026",
  deadlineLabel: "27 sep 2026",
  totalLabel: "€ 1.815,00",
  pdf: new Uint8Array(),
  fileName: "YM-F-2026-000001.pdf",
  projectName: "Website Alfa BV",
  payUrl: "https://pay.mollie.com/tr_1",
};

const activates = {
  serviceName: "Websitebeheer",
  monthlyNetCents: 2500,
  monthlyGrossCents: 3025,
  invoiceNetCents: 150000,
  firstDebitOn: "2026-10-01",
  projectSummary: "de nieuwe website van Alfa BV",
};

const mail = buildDocumentMailBody({ ...base, activates });
const plain = buildDocumentMailBody(base);

describe("the subject", () => {
  it("names the project, not the invoice number", () => {
    expect(invoiceSubject({ ...base, activates })).toBe("Factuur en maandelijkse service voor Website Alfa BV");
    expect(invoiceSubject({ ...base, activates })).not.toContain("YM-F");
  });

  it("stays an ordinary invoice subject when nothing is activated", () => {
    expect(invoiceSubject(base)).toBe("Factuur voor Website Alfa BV");
  });
});

describe("the activation mail", () => {
  it("opens with the project it is for", () => {
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain("Beste A. Alfa");
      expect(body).toContain("Hierbij ontvangt u de factuur voor de nieuwe website van Alfa BV.");
    }
  });

  /* Net and gross for both amounts; the one due now is the one marked as due. */
  it("shows the one-off amount excluding and including VAT", () => {
    for (const body of [mail.html, mail.text].map(flat)) {
      expect(body).toContain("Eenmalige betaling");
      expect(body).toContain("€ 1.500,00");
      expect(body).toContain("€ 1.815,00 — nu te betalen");
    }
  });

  it("shows the monthly amount excluding and including VAT, and the start date", () => {
    for (const body of [mail.html, mail.text].map(flat)) {
      expect(body).toContain("Maandelijkse Websitebeheer");
      expect(body).toContain("€ 25,00 per maand");
      expect(body).toContain("€ 30,25 per maand");
      expect(body).toContain("1 okt 2026");
    }
  });

  it("says in words what paying it authorises", () => {
    for (const body of [mail.html, mail.text].map(flat)) {
      expect(body).toContain(
        "Door de eenmalige factuur via onderstaande knop te betalen, activeert u tevens de automatische incasso voor de maandelijkse Websitebeheer.",
      );
      expect(body).toContain("Vanaf 1 okt 2026 wordt maandelijks € 30,25 automatisch geïncasseerd.");
    }
  });

  it("carries the combined call to action", () => {
    expect(mail.html).toContain("Factuur betalen &amp; automatische incasso activeren");
    expect(mail.html).toContain("https://pay.mollie.com/tr_1");
    expect(mail.text).toContain("Factuur betalen & automatische incasso activeren: https://pay.mollie.com/tr_1");
  });

  it("points at the PDF for the specification", () => {
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain("De volledige specificatie van de eenmalige factuur vindt u in de bijgevoegde PDF-factuur.");
    }
  });

  it("offers WhatsApp and e-mail for questions", () => {
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain("Heeft u een vraag of klopt er iets niet?");
      expect(body).toContain("https://wa.me/31653400220");
      expect(body).toContain("contact@ymcreations.com");
      expect(body).toContain("Met vriendelijke groet");
      expect(body).toContain("YM Creations");
    }
  });
});

describe("an invoice that activates nothing", () => {
  it("keeps the plain call to action and says nothing about a monthly amount", () => {
    expect(plain.html).toContain("Factuur betalen");
    expect(plain.html).not.toContain("automatische incasso activeren");
    for (const body of [plain.html, plain.text].map(flat)) {
      expect(body).not.toContain("€ 30,25");
      expect(body).not.toContain("per maand");
    }
  });
});
