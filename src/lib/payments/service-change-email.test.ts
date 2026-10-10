import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatCents } from "@/lib/money";
import { recipientFixture } from "@/lib/payments/fixtures";

/**
 * The written confirmation of a new monthly price: what it says, and that
 * it goes out through the one door every customer mail uses, so it lands on
 * the customer's record.
 */
const deliverEmail = vi.fn();
const recordCommunication = vi.fn();

vi.mock("@/lib/admin/communications/provider", () => ({
  deliverEmail: (...args: unknown[]) => deliverEmail(...args),
}));
vi.mock("@/lib/admin/communications/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/communications/log")>()),
  recordCommunication: (...args: unknown[]) => recordCommunication(...args),
}));

const { buildPriceChangeMail, sendPriceChangeMail, sendCancellationMail } = await import("@/lib/payments/service-change-email");

beforeEach(() => {
  vi.clearAllMocks();
  deliverEmail.mockResolvedValue({ sent: true, sentAt: "2026-10-25T10:00:00.000Z", messageId: "re_1" });
  recordCommunication.mockResolvedValue("comm-1");
});

const content = {
  serviceName: "Websitebeheer & hosting",
  oldNetCents: 1000,
  oldGrossCents: 1210,
  newNetCents: 1500,
  newGrossCents: 1815,
  vatRate: 21,
  effectiveFrom: "2026-12-04",
  firstDebitOn: "2026-12-04",
};

describe("the price change confirmation", () => {
  it("names the service, both prices incl. and excl. VAT, the effective date and the first collection", () => {
    const mail = buildPriceChangeMail({ ...content, contactName: "A. Alfa" });

    expect(mail.subject).toBe("Nieuw maandbedrag voor Websitebeheer & hosting | YM Creations");
    expect(mail.text).toContain("Beste A. Alfa,");
    expect(mail.text).toContain("met ingang van 4 dec 2026");
    expect(mail.text).toContain(`Huidig bedrag: ${formatCents(1000)} per maand excl. btw (${formatCents(1210)} incl. 21% btw)`);
    expect(mail.text).toContain(`Nieuw bedrag: ${formatCents(1500)} per maand excl. btw (${formatCents(1815)} incl. 21% btw)`);
    expect(mail.text).toContain(`Eerste incasso nieuw bedrag: 4 dec 2026, ${formatCents(1815)}`);
    expect(mail.text).toContain("Tot 4 dec 2026 blijft het huidige bedrag gelden");
    expect(mail.text).toContain("machtiging blijft ongewijzigd");
    expect(mail.html).toContain("18,15");
    expect(mail.html).toContain("4 dec 2026");
    // Text typed by a person is escaped in the HTML part.
    const hostile = buildPriceChangeMail({ ...content, contactName: "<b>X</b>", serviceName: "A & B <i>" });
    expect(hostile.html).not.toContain("<b>X</b>");
    expect(hostile.html).toContain("A &amp; B &lt;i&gt;");
  });

  it("goes out through sendCustomerEmail and is filed under its own category", async () => {
    const recipient = recipientFixture();
    const log = { db: { from: vi.fn() }, customerId: "cust-1", category: "recurring_price_change" as const, recurringServiceId: "svc-1" };

    const result = await sendPriceChangeMail({ log: log as never, recipient, content });

    expect(result).toEqual({ sent: true, sentAt: "2026-10-25T10:00:00.000Z" });
    expect(deliverEmail).toHaveBeenCalledTimes(1);
    expect(deliverEmail.mock.calls[0]![0]).toMatchObject({ to: "a@example.com", subject: expect.stringContaining("Nieuw maandbedrag") });
    expect(recordCommunication).toHaveBeenCalledTimes(1);
    expect(recordCommunication.mock.calls[0]![0]).toMatchObject({ category: "recurring_price_change", recurringServiceId: "svc-1" });
  });

  it("reports a refusal instead of logging a mail that never went", async () => {
    deliverEmail.mockResolvedValue({ sent: false, reason: "Mailconfiguratie ontbreekt (RESEND_API_KEY of CONTACT_FROM_EMAIL).", failure: "config" });

    const result = await sendCancellationMail({
      log: { db: { from: vi.fn() }, customerId: "cust-1", category: "recurring_cancellation" } as never,
      recipient: recipientFixture(),
      content: {
        serviceName: "SEO",
        monthlyGrossCents: 6050,
        requestedOn: "2026-10-10",
        endsOn: "2026-12-03",
        lastTerm: { start: "2026-11-04", end: "2026-12-03", partial: false, daysUsed: 30, periodDays: 30, grossCents: 6050 },
        collectionsAhead: ["2026-11-04"],
      },
    });

    expect(result).toMatchObject({ sent: false, reason: expect.stringContaining("Mailconfiguratie") });
    expect(recordCommunication).not.toHaveBeenCalled();
  });
});
