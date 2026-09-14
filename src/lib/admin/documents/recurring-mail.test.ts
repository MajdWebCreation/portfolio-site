import { describe, expect, it } from "vitest";
import { documentSubject } from "@/lib/admin/documents/email";

/*
  The cover note for a monthly term. It doubles as the SEPA pre-notification,
  so it has to name the collection date -- and it must not repeat the figures
  that are in the PDF, nor offer a way to pay something that is collected.
*/
const { buildDocumentMailBody } = await import("@/lib/admin/documents/email");

const base = {
  kind: "invoice" as const,
  number: "YM-F-2026-000001",
  recipientEmail: "a@example.com",
  contactName: "A. Alfa",
  issueDateLabel: "28 sep 2026",
  deadlineLabel: "12 okt 2026",
  totalLabel: "€ 30,25",
  pdf: new Uint8Array(),
  fileName: "YM-F-2026-000001.pdf",
};

const upcoming = buildDocumentMailBody({
  ...base,
  recurring: { serviceName: "Websitebeheer", collection: { kind: "scheduled", debitOn: "2026-10-12" } },
});

const settled = buildDocumentMailBody({
  ...base,
  recurring: { serviceName: "Websitebeheer", collection: { kind: "settled" } },
});

describe("the monthly term mail", () => {
  it("names the invoice and the service in the subject", () => {
    expect(documentSubject("invoice", "YM-F-2026-000001", "Websitebeheer")).toBe(
      "Factuur YM-F-2026-000001 — Websitebeheer",
    );
  });

  it("keeps to the essentials: service, monthly amount and the collection date", () => {
    for (const body of [upcoming.html, upcoming.text]) {
      expect(body).toContain("A. Alfa");
      expect(body).toContain("maandelijkse Websitebeheer");
      expect(body).toContain("Maandbedrag: € 30,25 incl. btw");
      expect(body).toContain("12 okt 2026");
      expect(body).toContain("automatisch geïncasseerd");
      expect(body).toContain("niets te doen");
      expect(body).toContain("bijgevoegde PDF-factuur");
    }
  });

  it("offers a way to object before the collection date", () => {
    expect(upcoming.text).toContain("Klopt er iets niet? Neem dan vóór 12 okt 2026 contact met ons op.");
  });

  /*
    The specification lives in the PDF. Repeating net, VAT and the period here
    would be a second set of figures that can disagree with the first.
  */
  it("does not repeat the financial specification", () => {
    for (const body of [upcoming.html, upcoming.text]) {
      expect(body).not.toContain("excl. btw");
      expect(body).not.toContain("Btw-bedrag");
      expect(body).not.toContain("Subtotaal");
    }
  });

  /* A button here would invite paying a debt that is already collected. */
  it("carries no payment button or link, in either variant", () => {
    for (const body of [upcoming.html, upcoming.text, settled.html, settled.text]) {
      expect(body).not.toContain("Factuur betalen");
      expect(body).not.toContain("pay.mollie.com");
      expect(body).not.toContain("betaling.mollie.com");
    }
  });

  /*
    The one link it does carry: reaching us. Same block as every other
    transactional mail, so "klopt er iets niet?" has somewhere to go.
  */
  it("offers WhatsApp and e-mail the same way the other mails do", () => {
    for (const body of [upcoming.html, upcoming.text, settled.html, settled.text]) {
      expect(body).toContain("WhatsApp ons");
      expect(body).toContain("https://wa.me/31653400220");
      expect(body).toContain("contact@ymcreations.com");
    }
  });

  /*
    The first term is paid by the customer in the activation checkout, so its
    mail announces nothing: it is the invoice for something already settled.
  */
  it("says a settled term is already paid, and names no collection date", () => {
    expect(settled.text).toContain("Deze factuur is reeds betaald.");
    expect(settled.text).not.toContain("geïncasseerd");
    expect(settled.text).not.toContain("12 okt 2026");
    expect(settled.text).not.toContain("Klopt er iets niet");
    expect(upcoming.text).toContain("wordt op 12 okt 2026 automatisch geïncasseerd");
  });

  it("keeps the settled mail to the five lines it should have", () => {
    expect(settled.text).toContain("Beste A. Alfa,");
    expect(settled.text).toContain("Hierbij ontvangt u de factuur voor uw maandelijkse Websitebeheer.");
    expect(settled.text).toContain("Maandbedrag: € 30,25 incl. btw");
    expect(settled.text).toContain("De volledige specificatie vindt u in de bijgevoegde PDF-factuur.");
  });

  it("signs off the way YM Creations does", () => {
    expect(settled.text).toContain("Met vriendelijke groet,");
    expect(settled.text).toContain("YM Creations");
  });

  /* A one-off invoice is untouched by any of this. */
  it("leaves an ordinary invoice mail alone", () => {
    const ordinary = buildDocumentMailBody({ ...base, payUrl: "https://pay.mollie.com/tr_1" });
    expect(ordinary.text).toContain("Hierbij factuur YM-F-2026-000001");
    expect(ordinary.text).toContain("Factuur betalen: https://pay.mollie.com/tr_1");
    expect(ordinary.text).not.toContain("maandelijkse");
  });
});
