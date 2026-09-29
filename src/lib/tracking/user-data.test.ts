import { describe, expect, it } from "vitest";
import { googleUserData, normalizeEmail, normalizePhoneE164 } from "@/lib/tracking/user-data";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Jan.Jansen@Bedrijf.NL ")).toBe("jan.jansen@bedrijf.nl");
  });

  it("removes the dots before the domain for Gmail addresses only", () => {
    expect(normalizeEmail("Jan.Jansen@gmail.com")).toBe("janjansen@gmail.com");
    expect(normalizeEmail("j.a.n@googlemail.com")).toBe("jan@googlemail.com");
    expect(normalizeEmail("jan.jansen@outlook.com")).toBe("jan.jansen@outlook.com");
  });

  it("leaves out what is not an address", () => {
    for (const raw of [undefined, "", "   ", "jan", "jan@", "@bedrijf.nl", "jan @bedrijf.nl", "jan@bedrijf", `${"a".repeat(250)}@x.nl`, "...@gmail.com"]) {
      expect(normalizeEmail(raw), String(raw)).toBeUndefined();
    }
  });
});

describe("normalizePhoneE164", () => {
  it("writes international and Dutch numbers as E.164", () => {
    expect(normalizePhoneE164("+31 6 12 34 56 78")).toBe("+31612345678");
    expect(normalizePhoneE164("+31 (0)6-12345678")).toBe("+31612345678");
    expect(normalizePhoneE164("0031 6 12345678")).toBe("+31612345678");
    expect(normalizePhoneE164("06 12 34 56 78")).toBe("+31612345678");
    expect(normalizePhoneE164("020 123 4567")).toBe("+31201234567");
    expect(normalizePhoneE164("+32 470 12 34 56")).toBe("+32470123456");
  });

  it("leaves out what it cannot place without guessing", () => {
    for (const raw of [undefined, "", "12345", "612345678", "0612345", "+31 6 123", "+0 123 456 789 01", "bel me", "+31612345678901234"]) {
      expect(normalizePhoneE164(raw), String(raw)).toBeUndefined();
    }
  });
});

describe("googleUserData", () => {
  it("carries only the fields that normalised", () => {
    expect(googleUserData({ email: "Jan@Bedrijf.nl", phone: "06 12345678" })).toEqual({
      email: "jan@bedrijf.nl",
      phone_number: "+31612345678",
    });
    expect(googleUserData({ email: "jan@bedrijf.nl", phone: "" })).toEqual({ email: "jan@bedrijf.nl" });
    expect(googleUserData({ email: "geen adres", phone: "06 12345678" })).toEqual({ phone_number: "+31612345678" });
  });

  it("is null when nothing usable is left", () => {
    expect(googleUserData(undefined)).toBeNull();
    expect(googleUserData({})).toBeNull();
    expect(googleUserData({ email: "x", phone: "y" })).toBeNull();
  });
});
