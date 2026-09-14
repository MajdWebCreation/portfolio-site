import { describe, expect, it } from "vitest";
import { reminderFeeCents } from "@/lib/payments/collection-policy";
import { buildReminderMailBody, reminderSubject, type ReminderMailContent } from "@/lib/payments/reminder-email";

/*
  What the customer actually reads.

  Amounts are compared with the spaces normalised: Intl puts a non-breaking
  space after the euro sign, which is right in a mail and unreadable in an
  assertion.
*/
const flat = (value: string) => value.replace(/\u00a0/g, " ");

/**
 * The sentence as a reader sees it: HTML escaping undone and the euro's
 * non-breaking space normalised, so an assertion can quote the Dutch.
 */
const visible = (value: string) =>
  flat(value).replaceAll("&#039;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");

/** The words a customer reads, with the link targets taken out. */
const copy = (value: string) => visible(value.replace(/https?:\/\/\S+/g, ""));

const base: Omit<ReminderMailContent, "stage"> = {
  contactName: "A. Alfa",
  invoiceNumber: "YM-F-2026-000001",
  dueDateLabel: "1 okt 2026",
  daysOverdue: 1,
  outstandingLabel: "€ 1.815,00",
  finalDateLabel: "22 okt 2026",
  payUrl: "https://payment-link.mollie.com/payment/pl_1",
};

const first = buildReminderMailBody({ ...base, stage: "first_reminder" });
const second = buildReminderMailBody({ ...base, stage: "second_reminder", daysOverdue: 7 });
const final = buildReminderMailBody({ ...base, stage: "final_notice", daysOverdue: 14 });

const everyMail = [first, second, final];

describe("the subjects", () => {
  it("say what the mail is, and never carry the invoice number", () => {
    expect(reminderSubject("first_reminder")).toBe("Herinnering voor je openstaande factuur");
    expect(reminderSubject("second_reminder")).toBe("Tweede herinnering voor je openstaande factuur");
    expect(reminderSubject("final_notice")).toBe("Laatste aanmaning voor je openstaande factuur");

    for (const stage of ["first_reminder", "second_reminder", "final_notice"] as const) {
      expect(reminderSubject(stage)).not.toContain("YM-F");
    }
  });
});

describe("the first reminder, on day 1", () => {
  it("opens the way a person would", () => {
    for (const body of [first.html, first.text]) {
      expect(body).toContain("Beste A. Alfa");
      expect(body).toContain(
        "Waarschijnlijk is deze factuur aan je aandacht ontsnapt. We willen je vriendelijk herinneren dat deze inmiddels is verlopen.",
      );
    }
  });

  it("shows the number, the due date and what is left", () => {
    for (const body of everyMail.map((mail) => visible(mail.text))) {
      expect(body).toContain("Factuurnummer: YM-F-2026-000001");
      expect(body).toContain("Vervaldatum: 1 okt 2026");
      expect(body).toContain("Nog te voldoen: € 1.815,00");
    }
  });

  it("carries the payment button", () => {
    expect(first.html).toContain("Factuur betalen");
    expect(first.html).toContain("https://payment-link.mollie.com/payment/pl_1");
    expect(first.text).toContain("Factuur betalen: https://payment-link.mollie.com/payment/pl_1");
  });

  it("allows for the mail and the payment crossing", () => {
    for (const body of [first.html, first.text]) {
      expect(body).toContain(
        "Heb je de betaling net gedaan? Dan hebben onze berichten elkaar gekruist en kun je deze mail als niet verzonden beschouwen.",
      );
    }
  });

  /* Friendly means friendly: no fee, no threat, no deadline. */
  it("says nothing about costs, collection or a deadline", () => {
    for (const body of [first.html, first.text].map(visible)) {
      expect(body).not.toContain("€ 20,00");
      expect(body).not.toContain("herinneringskosten");
      expect(body).not.toContain("incasso");
      expect(body).not.toContain("rente");
      expect(body).not.toContain("aanmaning");
      expect(body).not.toContain("uiterlijk");
    }
  });
});

describe("the second reminder, on day 7", () => {
  it("says how long it has been", () => {
    for (const body of [second.html, second.text]) {
      expect(body).toContain("Onze factuur is inmiddels 7 dagen verlopen en we hebben je betaling nog niet ontvangen.");
      expect(body).toContain("Dagen verlopen");
    }
  });

  /*
    The one sentence that mentions a fee. It says "kunnen", it says "bij
    verdere opvolging", and it says the amount is not on the invoice.
  */
  it("warns about the fee as a possibility, not as a debt", () => {
    for (const body of [second.html, second.text].map(visible)) {
      expect(body).toContain(
        "We verzoeken je de openstaande factuur alsnog te voldoen. Wanneer betaling uitblijft, kunnen bij verdere opvolging € 20,00 herinneringskosten in rekening worden gebracht. Deze kosten zijn op dit moment nog niet aan de factuur toegevoegd.",
      );
    }
  });

  it("never calls the fee a statutory cost, and never adds it to the amount", () => {
    for (const body of [second.html, second.text].map(visible)) {
      expect(body).not.toContain("wettelijke incassokosten");
      expect(body).not.toContain("verschuldigd");
      // What is asked for is the invoice's own amount, unchanged: not one
      // cent of the announced fee is in it.
      expect(body).toContain("Nog te voldoen");
      expect(body).toContain("€ 1.815,00");
      expect(body).not.toContain("€ 1.835,00");
    }
  });

  it("says in words that the button charges nothing extra", () => {
    for (const body of [second.html, second.text].map(visible)) {
      expect(body).toContain(
        "Het bedrag hierboven is het openstaande factuurbedrag. Met de knop betaal je precies dat; er wordt niets extra's in rekening gebracht.",
      );
    }
  });

  it("offers a way out for a customer who cannot pay right now", () => {
    for (const body of [second.html, second.text]) {
      expect(body).toContain("Lukt betalen op dit moment niet? Laat het ons weten, dan kijken we samen naar een oplossing.");
    }
  });

  /* The amount comes from the policy module and from nowhere else. */
  it("reads the amount from the one place it is configured", () => {
    expect(reminderFeeCents).toBe(2000);
    expect(flat(second.text)).toContain("€ 20,00");
  });
});

describe("the final notice, on day 14", () => {
  it("is formal without being aggressive", () => {
    for (const body of [final.html, final.text]) {
      expect(body).toContain(
        "Ondanks onze eerdere herinneringen staat onze factuur nog open. Met deze aanmaning stellen we je formeel in de gelegenheid om alsnog te betalen.",
      );
      expect(body).toContain("We verzoeken je het openstaande bedrag uiterlijk 22 okt 2026 te voldoen.");
      expect(body).toContain("Uiterste betaaldatum");
    }
  });

  it("names the consequences without inventing a single figure", () => {
    for (const body of [final.html, final.text]) {
      expect(body).toContain(
        "Blijft betaling na deze termijn uit, dan kunnen wij aanspraak maken op de wettelijke handelsrente en op de buitengerechtelijke incassokosten die volgens de geldende wettelijke regeling verschuldigd zijn. Ook kunnen wij de vordering dan voorbereiden voor overdracht aan een incassopartner.",
      );
    }
  });

  /* Read against the words, not the markup: the shell's own CSS is full of
     percentages and none of them is a rate we are quoting. */
  it("quotes no percentage and no statutory amount of its own", () => {
    expect(final.text).not.toMatch(/\d+([.,]\d+)?\s*%/);
    expect(final.text).not.toContain("40,00");
  });

  /* The EUR 20 belongs to day 7 only; a formal notice does not repeat it. */
  it("does not repeat the announced reminder fee", () => {
    for (const body of [final.html, final.text].map(visible)) {
      expect(body).not.toContain("€ 20,00");
      expect(body).not.toContain("herinneringskosten in rekening");
    }
  });

  it("keeps the door open until the last day", () => {
    for (const body of [final.html, final.text]) {
      expect(body).toContain(
        "Klopt er iets niet aan deze factuur, of lukt betalen niet? Neem dan vóór 22 okt 2026 contact met ons op, dan zoeken we samen naar een oplossing.",
      );
    }
  });
});

describe("every reminder", () => {
  it("offers WhatsApp and e-mail, from the shared contact block", () => {
    for (const mail of everyMail) {
      expect(mail.html).toContain(">WhatsApp ons<");
      expect(mail.text).toContain("WhatsApp ons: https://wa.me/31653400220");
      expect(mail.text).toContain("E-mail: contact@ymcreations.com");
      expect(mail.text).toContain("Met vriendelijke groet,");
    }
  });

  /* One voice per mail: these three say "je" from the greeting to the
     contact block, where the invoice mail says "u" throughout. */
  it("keeps to one form of address", () => {
    for (const mail of everyMail) {
      for (const body of [visible(mail.html), mail.text]) {
        expect(body).not.toContain("Heeft u een vraag");
        expect(body).not.toMatch(/\bu\b(?! bent ingelogd)/);
      }
    }
  });

  /*
    A customer reads about an invoice and a button, never about machinery.
    Checked against the words rather than the markup: the button's href is a
    provider URL, and that is a target, not something anybody reads.
  */
  it("uses no technical word anywhere in the copy", () => {
    for (const mail of everyMail) {
      for (const body of [copy(mail.html), copy(mail.text)]) {
        for (const word of ["mollie", "webhook", "provider", "sepa", "incassomotor", "collection", "payment link"]) {
          expect(body.toLowerCase()).not.toContain(word);
        }
      }
    }
  });

  it("calls the button what it does", () => {
    for (const mail of everyMail) {
      expect(mail.html).toContain(">Factuur betalen<");
    }
  });

  it("still goes out when there is no payment button to offer", () => {
    for (const stage of ["first_reminder", "second_reminder", "final_notice"] as const) {
      const body = buildReminderMailBody({ ...base, stage, payUrl: undefined });
      expect(body.text).toContain("Beste A. Alfa");
      expect(body.text).not.toContain("Factuur betalen:");
      expect(body.html).not.toContain("payment-link");
    }
  });
});
