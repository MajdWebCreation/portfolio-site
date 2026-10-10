import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { recurringFixture } from "@/lib/payments/fixtures";
import { recurringOverview } from "@/lib/payments/prenotification";
import { recurringManagement } from "@/lib/payments/recurring-management";
import type { PriceChange, RecurringService } from "@/lib/payments/types";

/*
  The server actions and the router are not exercised by a static render;
  what is checked is that every state the view model can be in renders, and
  says the right thing about what applies now versus what comes later.
*/
vi.mock("@/lib/payments/actions", () => ({
  cancelRecurringService: vi.fn(),
  createRecurringService: vi.fn(),
  scheduleRecurringPriceChange: vi.fn(),
  startMonthlyCollection: vi.fn(),
  withdrawRecurringCancellation: vi.fn(),
  withdrawRecurringPriceChange: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { default: CustomerRecurring } = await import("@/components/admin/customers/customer-recurring");

const service = (overrides: Partial<RecurringService> = {}): RecurringService =>
  recurringFixture({
    id: "svc-1",
    name: "Websitebeheer & hosting",
    amountCents: 1000,
    startsOn: "2026-09-04",
    status: "active",
    mollie: { subscriptionId: "sub_1" },
    ...overrides,
  });

const change = (overrides: Partial<PriceChange> = {}): PriceChange => ({
  id: "pc-1",
  recurringServiceId: "svc-1",
  customerId: "cust-1",
  oldAmountCents: 1000,
  newAmountCents: 1500,
  effectiveFrom: "2026-12-04",
  requestedAt: "2026-10-25T10:00:00.000Z",
  ...overrides,
});

function render(input: { service: RecurringService; priceChanges?: PriceChange[]; billed?: string[]; todayKey: string }) {
  const billedPeriodStarts = input.billed ?? ["2026-09-04", "2026-10-04", "2026-11-04"];
  const priceChanges = input.priceChanges ?? [];
  const overview = recurringOverview({ service: input.service, billedPeriodStarts, priceChanges }, [], input.todayKey);
  const management = recurringManagement({ service: input.service, priceChanges, billedPeriodStarts, overview, todayKey: input.todayKey });
  return renderToStaticMarkup(
    <CustomerRecurring
      customerId="cust-1"
      services={[input.service]}
      overviews={{ "svc-1": overview }}
      managements={{ "svc-1": management }}
      directDebit={{ status: "active" }}
      firstCollections={{}}
      todayKey={input.todayKey}
    />,
  );
}

describe("the recurring services panel", () => {
  it("offers both actions for a collecting service and shows the current price twice over", () => {
    const html = render({ service: service(), todayKey: "2026-10-25" });
    expect(html).toContain("Maandbedrag wijzigen");
    expect(html).toContain("Dienst opzeggen");
    expect(html).toContain("Huidig maandbedrag");
    expect(html).toContain("excl. btw");
    expect(html).toContain("incl. btw");
    expect(html).toContain("Actief");
  });

  it("keeps a planned price apart from the current one, with its date", () => {
    const html = render({ service: service(), priceChanges: [change()], todayKey: "2026-10-25" });
    expect(html).toContain("Prijswijziging gepland");
    expect(html).toContain("Vanaf 4 dec 2026");
    expect(html).toContain("Op 20 nov 2026 controleert de dagelijkse taak bij Mollie");
    expect(html).toContain("Prijswijziging intrekken");
    // One change at a time: the button to plan another is gone.
    expect(html).not.toContain("Maandbedrag wijzigen");
    expect(html).toContain("Prijshistorie (1)");
  });

  it("shows a planned end with its pro-rata last term and the day Mollie is cancelled", () => {
    const html = render({
      service: service({ endsOn: "2026-11-09", cancellationRequestedAt: "2026-10-10T10:00:00.000Z", lastTerm: { amountCents: 200, syncedAt: "2026-10-10T10:00:01.000Z" } }),
      billed: ["2026-09-04", "2026-10-04"],
      todayKey: "2026-10-25",
    });
    expect(html).toContain("Opgezegd — eindigt op 9 nov 2026");
    expect(html).toContain("Laatste termijn");
    expect(html).toContain("4 nov 2026 t/m 9 nov 2026 (6 van 30 dagen)");
    expect(html).toContain("Bedrag laatste termijn afgestemd");
    expect(html).toContain("Wordt geannuleerd op 5 nov 2026");
    expect(html).toContain("Opzegging intrekken");
    expect(html).not.toContain("Dienst opzeggen");
  });

  it("shows the credit owed when the last term was announced in full", () => {
    const html = render({
      service: service({ endsOn: "2026-11-24", cancellationRequestedAt: "2026-10-25T10:00:00.000Z", lastTerm: { amountCents: 1000, syncedAt: "2026-10-25T10:00:01.000Z" } }),
      todayKey: "2026-10-26",
    });
    expect(html).toContain("Te crediteren");
    expect(html).toContain("9 dagen na 24 nov 2026");
    expect(html).toContain("Open — handmatig crediteren en terugbetalen");
    expect(html).toContain("Creditering als verwerkt markeren");
    expect(html).toContain("Creditering open");

    const settled = render({
      service: service({ endsOn: "2026-11-24", cancellationRequestedAt: "2026-10-25T10:00:00.000Z", lastTerm: { amountCents: 1000, syncedAt: "2026-10-25T10:00:01.000Z" }, creditSettledAt: "2026-11-01T09:00:00.000Z" }),
      todayKey: "2026-11-02",
    });
    expect(settled).toContain("Verwerkt op");
    expect(settled).not.toContain("Creditering als verwerkt markeren");
  });

  it("reads as ended afterwards, and warns when Mollie was never cancelled or left a problem", () => {
    const stuck = render({
      service: service({ endsOn: "2026-11-09", cancellationRequestedAt: "2026-10-10T10:00:00.000Z" }),
      todayKey: "2026-11-12",
    });
    expect(stuck).toContain("Beëindigd op 9 nov 2026");
    expect(stuck).toContain("nog niet geannuleerd");
    expect(stuck).not.toContain("Opzegging intrekken");

    const done = render({
      service: service({
        endsOn: "2026-11-09",
        cancellationRequestedAt: "2026-10-10T10:00:00.000Z",
        status: "canceled",
        lifecycleProblem: "Mollie heeft al een incasso aangemaakt voor 2026-12-04 (EUR 12.10, tr_dec), na de einddatum; Mollie laat die niet meer annuleren.",
        mollie: { subscriptionId: "sub_1", subscriptionCanceledAt: "2026-11-05T07:00:00.000Z" },
      }),
      todayKey: "2026-11-12",
    });
    expect(done).toContain("Beëindigd op 9 nov 2026");
    expect(done).toContain("Geannuleerd op");
    expect(done).toContain("tr_dec");
  });

  it("offers neither action for a service that does not collect yet", () => {
    const html = render({ service: service({ status: "draft", mollie: {} }), billed: [], todayKey: "2026-10-25" });
    expect(html).not.toContain("Maandbedrag wijzigen");
    expect(html).not.toContain("Dienst opzeggen");
    expect(html).toContain("Maandelijkse incasso starten");
  });
});
