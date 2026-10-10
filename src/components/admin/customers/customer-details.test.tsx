import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Customer } from "@/lib/admin/customers/types";

/*
  The customer's data on its page: read-only by default, with the one pencil
  that turns the same rows into inputs, and the notes that are always open.
  A static render covers what is on the page in each state; the toggle
  itself is a click the browser makes.
*/
vi.mock("@/lib/admin/customers/actions", () => ({ updateCustomer: vi.fn(), createCustomer: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { default: CustomerDetails, CustomerDetailsFields, CustomerDetailsView, CustomerNotes } = await import(
  "@/components/admin/customers/customer-details"
);

const customer: Customer = {
  id: "cust-1",
  companyName: "Alfa BV",
  contactName: "A. Alfa",
  email: "a@example.com",
  phone: "06 1234 5678",
  address: { street: "Straat 1", postalCode: "1011 AA", city: "Amsterdam", country: "Nederland" },
  kvkNumber: "12345678",
  vatNumber: "NL001234567B01",
  notes: "Via een referral.",
  status: "active",
  createdAt: "2026-09-01T09:00:00.000Z",
};

describe("the customer's data", () => {
  it("opens read-only: every field as a row, one pencil, and not a single input", () => {
    const html = renderToStaticMarkup(<CustomerDetails customer={customer} />);
    for (const value of ["Alfa BV", "A. Alfa", "a@example.com", "06 1234 5678", "Actief", "Straat 1", "1011 AA", "Amsterdam", "Nederland", "12345678", "NL001234567B01"]) {
      expect(html).toContain(value);
    }
    expect(html).toContain('aria-label="Klantgegevens bewerken"');
    expect(html).toContain('title="Klantgegevens bewerken"');
    expect(html).toContain('type="button"');
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Gegevens bewerken");
  });

  it("shows a dash, not an empty cell, for what is not filled in", () => {
    const html = renderToStaticMarkup(<CustomerDetailsView customer={{ ...customer, phone: undefined, kvkNumber: undefined, vatNumber: undefined }} />);
    expect(html.match(/—/g)).toHaveLength(3);
  });

  it("turns the same fields into prefilled inputs with their errors in edit mode", () => {
    const values = {
      companyName: "Alfa BV",
      contactName: "A. Alfa",
      email: "niet-geldig",
      phone: "06 1234 5678",
      street: "Straat 1",
      postalCode: "1011 AA",
      city: "Amsterdam",
      country: "Nederland",
      kvkNumber: "12345678",
      vatNumber: "NL001234567B01",
      status: "active",
    };
    const html = renderToStaticMarkup(<CustomerDetailsFields values={values} errors={{ email: "Dit is geen geldig e-mailadres." }} onChange={() => {}} />);
    expect(html).toContain('value="Alfa BV"');
    expect(html).toContain('value="Straat 1"');
    expect(html).toContain('value="NL001234567B01"');
    expect(html).toContain("Dit is geen geldig e-mailadres.");
    expect(html).toContain("<select");
    // Notes are not part of this form; they have their own.
    expect(html).not.toContain("<textarea");
  });

  it("keeps the internal notes open as a textarea with their own save button", () => {
    const html = renderToStaticMarkup(<CustomerNotes customer={customer} />);
    expect(html).toContain("Interne notities");
    expect(html).toContain("<textarea");
    expect(html).toContain("Via een referral.");
    expect(html).toContain("Notities opslaan");
  });
});
