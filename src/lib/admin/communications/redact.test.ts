import { describe, expect, it } from "vitest";
import { createActivationToken } from "@/lib/payments/tokens";
import { containsSecret, redactSecrets, redactedTokenMarker } from "@/lib/admin/communications/redact";

/*
  The token in an activation link is the one thing the log must not keep.
  These pin down that a real token -- the shape tokens.ts produces -- is
  removed wherever the link appears, and that nothing else is touched.
*/
const { token } = createActivationToken();
const link = `https://ymcreations.com/nl/incasso/${token}`;

describe("an activation link in a mail body", () => {
  it("loses its token in plain text", () => {
    const text = `Beste Anna,\n\nActiveren: ${link}\n\nYM Creations`;

    const redacted = redactSecrets(text);

    expect(redacted).not.toContain(token);
    expect(redacted).toContain(`/nl/incasso/${redactedTokenMarker}`);
    expect(redacted.startsWith("Beste Anna,")).toBe(true);
    expect(redacted.endsWith("YM Creations")).toBe(true);
  });

  it("loses its token inside an href and its visible text", () => {
    const html = `<a href="${link}">Automatische incasso activeren</a> of ${link}`;

    const redacted = redactSecrets(html);

    expect(redacted).not.toContain(token);
    expect(redacted).toContain(`href="https://ymcreations.com/nl/incasso/${redactedTokenMarker}"`);
    expect(redacted).toContain("Automatische incasso activeren");
  });

  it("is removed from an English link as well", () => {
    expect(redactSecrets(`/en/incasso/${token}`)).toBe(`/en/incasso/${redactedTokenMarker}`);
  });

  it("is reported before and not after", () => {
    expect(containsSecret(link)).toBe(true);
    expect(containsSecret(redactSecrets(link))).toBe(false);
  });

  it("is stable under a second pass", () => {
    const once = redactSecrets(link);
    expect(redactSecrets(once)).toBe(once);
  });
});

describe("everything that is not an activation token", () => {
  it("stays exactly as it was", () => {
    const body = [
      "Factuur YM-F-2026-000012, te betalen via https://www.mollie.com/checkout/abc",
      "Status: https://ymcreations.com/nl/betaling/incasso-afgerond?status=gebruikt",
      "Link zonder token: https://ymcreations.com/nl/incasso/",
      "Te kort om een token te zijn: /nl/incasso/abc123",
    ].join("\n");

    expect(redactSecrets(body)).toBe(body);
    expect(containsSecret(body)).toBe(false);
  });
});
