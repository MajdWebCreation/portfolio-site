import { describe, expect, it } from "vitest";
import { firstProjectError, hasProjectErrors, validateProject } from "@/lib/admin/projects/validation";

const valid = { customerId: "c1", name: "Nieuwe webshop", status: "planned" };

describe("project validation", () => {
  it("accepts a project with just a customer, a name and a status", () => {
    expect(hasProjectErrors(validateProject(valid, { requireCustomer: true }))).toBe(false);
  });

  it("requires a customer when one is being chosen, and not when editing", () => {
    expect(validateProject({ ...valid, customerId: "" }, { requireCustomer: true }).customerId).toBe("Kies een klant.");
    expect(validateProject({ name: "Werk", status: "active" }, { requireCustomer: false }).customerId).toBeUndefined();
  });

  it("refuses a blank name, the way the table's check constraint does", () => {
    expect(validateProject({ ...valid, name: "   " }, { requireCustomer: true }).name).toBe("Vul een projectnaam in.");
  });

  it("refuses a status the table would not accept", () => {
    expect(validateProject({ ...valid, status: "archived" }, { requireCustomer: true }).status).toBe("Kies een geldige status.");
  });

  /*
    The four situations the table's check constraint allows, stated here as
    well so the form and the database cannot drift apart: neither date, either
    date on its own, or both in order.
  */
  it("accepts every combination of the two dates except a deadline before the start", () => {
    const cases: { startDate?: string; deadline?: string }[] = [
      {},
      { startDate: "2026-09-01" },
      { deadline: "2026-09-01" },
      { startDate: "2026-09-01", deadline: "2026-12-01" },
    ];
    for (const dates of cases) {
      expect(hasProjectErrors(validateProject({ ...valid, ...dates }, { requireCustomer: true }))).toBe(false);
    }
  });

  it("treats an empty date field as no date at all", () => {
    expect(hasProjectErrors(validateProject({ ...valid, startDate: "", deadline: "" }, { requireCustomer: true }))).toBe(false);
    expect(hasProjectErrors(validateProject({ ...valid, startDate: "", deadline: "2026-01-01" }, { requireCustomer: true }))).toBe(false);
  });

  it("refuses dates that are not calendar dates", () => {
    expect(validateProject({ ...valid, startDate: "01-09-2026" }, { requireCustomer: true }).startDate).toBeTruthy();
    expect(validateProject({ ...valid, deadline: "2026-02-30" }, { requireCustomer: true }).deadline).toBeTruthy();
  });

  /* The same rule as projects_deadline_after_start on the table. */
  it("refuses a deadline before the start date and accepts one on the same day", () => {
    expect(validateProject({ ...valid, startDate: "2026-10-01", deadline: "2026-09-01" }, { requireCustomer: true }).deadline).toBe(
      "De deadline ligt vóór de startdatum.",
    );
    expect(
      hasProjectErrors(validateProject({ ...valid, startDate: "2026-09-01", deadline: "2026-09-01" }, { requireCustomer: true })),
    ).toBe(false);
  });

  it("reports one message for an action, and null when there is nothing wrong", () => {
    expect(firstProjectError(validateProject({ ...valid, name: "" }, { requireCustomer: true }))).toBe("Vul een projectnaam in.");
    expect(firstProjectError(validateProject(valid, { requireCustomer: true }))).toBeNull();
  });
});
