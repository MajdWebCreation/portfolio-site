import { describe, expect, it } from "vitest";
import { buildWebsitecheckConfirmation } from "@/lib/email/websitecheck";

/*
  The websitecheck receipt. It confirms one thing and offers one action
  (reply), and it must keep looking like that: no campaign, no prices, no
  buttons, no portfolio. Checked on the rendered HTML and text, not on the
  intent.
*/
const mail = buildWebsitecheckConfirmation({ locale: "nl", name: "Anna <Voorbeeld>", websiteUrl: "https://www.jouwbedrijf.nl/over-ons" });

/* What a reader sees: the HTML without its tags and inline styles. */
const visible = mail.html.replace(/<[^>]+>/g, " ");

describe("the websitecheck confirmation", () => {
  it("has a transactional subject without a sender suffix or promotion", () => {
    expect(mail.subject).toBe("Je websitecheck-aanvraag is ontvangen");
    expect(mail.subject).not.toMatch(/gratis|korting|%|!/i);
  });

  it("greets the person by name, escaped in HTML", () => {
    expect(mail.text).toContain("Hallo Anna <Voorbeeld>,");
    expect(mail.html).toContain("Hallo Anna &lt;Voorbeeld&gt;,");
  });

  it("names the site as a person would say it", () => {
    expect(mail.text).toContain("websitecheck van jouwbedrijf.nl goed ontvangen");
    expect(mail.html).toContain("websitecheck van jouwbedrijf.nl goed ontvangen");
    expect(mail.html).not.toContain("https://www.jouwbedrijf.nl");
  });

  it("says a person looks at it and invites a reply, without a response time", () => {
    expect(mail.text).toContain("bekijkt je website persoonlijk");
    expect(mail.text).toContain("Reageer dan gewoon op deze e-mail.");
    expect(mail.text).not.toMatch(/binnen \d+|24 uur|werkdag/i);
  });

  it("carries no discount, price or campaign wording", () => {
    for (const rendered of [visible, mail.text]) {
      expect(rendered).not.toMatch(/korting|actie|tijdelijk|€|\d+\s?%|prijs|tarie|offerte/i);
    }
  });

  it("has no button, no portfolio or social block and only the one footer link", () => {
    expect(mail.html).not.toMatch(/emailButton|display:inline-block;padding:1[03]px/);
    expect(mail.html).not.toMatch(/whatsapp|wa\.me|linkedin|instagram|facebook/i);
    expect(visible).not.toMatch(/projecten|portfolio|bekijk alle|live draai/i);
    const links = mail.html.match(/<a /g) ?? [];
    expect(links).toHaveLength(1);
    expect(mail.html).toContain('href="https://ymcreations.com"');
    expect(mail.html).not.toMatch(/<img/);
  });

  it("keeps the HTML and the plain text saying the same things", () => {
    for (const line of ["Bedankt voor je aanvraag.", "Met vriendelijke groet,", "YM Creations"]) {
      expect(mail.text).toContain(line);
      expect(mail.html).toContain(line);
    }
  });

  it("has an English counterpart with the same shape", () => {
    const en = buildWebsitecheckConfirmation({ locale: "en", name: "Anna", websiteUrl: "https://example.com/" });
    expect(en.subject).toBe("Your website check request has been received");
    expect(en.text).toContain("Hello Anna,");
    expect(en.text).toContain("website check of example.com");
    expect(en.text).toContain("Just reply to this email.");
  });
});
