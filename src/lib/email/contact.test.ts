import { describe, expect, it } from "vitest";
import { contactSectionHtml, contactTextLines, whatsappUrl } from "@/lib/email/contact";
import { emailButton } from "@/lib/email/shell";

/*
  The way every transactional mail says "reach us".

  It used to be a bare `wa.me` URL pasted into a sentence, which is unreadable
  and, on a phone, nothing worth tapping. It is a button now -- but a quieter
  one than the payment button above it, because paying is what those mails are
  for and this is only how you answer them.
*/
describe("the contact block in HTML", () => {
  const html = contactSectionHtml();

  it("offers WhatsApp as a labelled button, not a pasted URL", () => {
    expect(html).toContain(">WhatsApp ons<");
    expect(html).toContain(`href="${whatsappUrl}"`);
    // The URL itself is never the link text.
    expect(html).not.toContain(`>${whatsappUrl}<`);
  });

  it("keeps e-mail as the quieter alternative under it", () => {
    expect(html).toContain("Of mail naar ");
    expect(html).toContain('href="mailto:contact@ymcreations.com"');
  });

  /*
    Hierarchy, checked rather than eyeballed: the payment button is filled and
    dark, the WhatsApp button is an outline on the paper colour.
  */
  it("stays visually secondary to the payment button", () => {
    const primary = emailButton("https://pay.mollie.com/tr_1", "Factuur betalen");
    expect(primary).toContain("background:#14161a");
    expect(primary).toContain("color:#ffffff");
    expect(html).not.toContain("background:#14161a");
    expect(html).toContain("border:1px solid #d6d5cd");
  });

  /* A table inside a `<p>` is what breaks Outlook's renderer. */
  it("puts the button outside the paragraph", () => {
    // A <table> reached before the paragraph it opened is closed.
    expect(html).not.toMatch(/<p[^>]*>(?:(?!<\/p>)[^])*<table/);
  });

  it("uses the customer's own words for the reason, when a mail has one", () => {
    expect(contactSectionHtml("Vragen over deze factuur?")).toContain("Vragen over deze factuur?");
  });
});

describe("the contact block in plain text", () => {
  it("writes the URL out, because a text mail has nothing else to act on", () => {
    expect(contactTextLines()).toEqual([
      "Heeft u een vraag of klopt er iets niet? Neem gerust contact met ons op.",
      "WhatsApp ons: https://wa.me/31653400220",
      "E-mail: contact@ymcreations.com",
    ]);
  });
});
