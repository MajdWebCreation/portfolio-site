import { describe, expect, it } from "vitest";
import { fieldOfColumn, normalizeProfile, profileColumns, validateProfile } from "@/lib/portal/profile/model";

const valid = {
  companyName: "Alfa BV",
  contactName: "Jan Jansen",
  email: "jan@alfa.nl",
  billingEmail: "",
  phone: "020 123 4567",
  street: "Straat 1",
  postalCode: "1011 AA",
  city: "Amsterdam",
  country: "Nederland",
  kvkNumber: "",
  vatNumber: "",
};

describe("the profile rules", () => {
  it("trim, fold a phone's spaces and default the country", () => {
    expect(normalizeProfile({ ...valid, companyName: "  Alfa BV ", phone: " 06  12 34 ", country: "  ", notes: "x" } as never)).toEqual({
      ...valid,
      phone: "06 12 34",
      country: "Nederland",
    });
  });

  it("ignore anything that is not a field", () => {
    expect(Object.keys(normalizeProfile({ ...valid, notes: "x", status: "inactive" } as never)).sort()).toEqual(Object.keys(profileColumns).sort());
  });

  it("accept a complete profile, and foreign KvK or VAT formats", () => {
    expect(validateProfile(normalizeProfile({ ...valid, kvkNumber: "HRB 12345", vatNumber: "BE0123.456.789" }))).toEqual({});
  });

  it.each([
    ["companyName", ""],
    ["contactName", " "],
    ["email", "jan@"],
    ["billingEmail", "facturen"],
    ["phone", "bel me"],
    ["street", "<b>Straat</b>"],
    ["city", "x".repeat(121)],
  ] as const)("refuse %s = %j", (field, value) => {
    expect(validateProfile(normalizeProfile({ ...valid, [field]: value }))[field]).toBeTruthy();
  });

  it("leave an empty billing address alone", () => {
    expect(validateProfile(normalizeProfile({ ...valid, billingEmail: "  " })).billingEmail).toBeUndefined();
  });

  it("name every field by its column and back", () => {
    for (const [field, column] of Object.entries(profileColumns)) expect(fieldOfColumn(column)).toBe(field);
    expect(fieldOfColumn("notes")).toBeUndefined();
  });
});
