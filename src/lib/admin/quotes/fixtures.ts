import { customerFixtures } from "@/lib/admin/customers/fixtures";
import { issuedDocumentNumber } from "@/lib/admin/documents/numbering";
import { snapshotCustomer } from "@/lib/admin/documents/types";
import type { Quote } from "@/lib/admin/quotes/types";

const customer = (id: string) => {
  const found = customerFixtures.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown customer fixture ${id}`);
  return snapshotCustomer(found);
};

/** Fictional quotes for development, priced with the public starting prices. */
export const quoteFixtures: Quote[] = [
  {
    id: "quote-2026-0007",
    number: issuedDocumentNumber("quote", 2026, 7),
    status: "sent",
    customer: customer("cust-2026-007"),
    issueDate: "2026-09-03",
    validUntil: "2026-10-03",
    subject: "Website met online afspraken",
    intro:
      "Naar aanleiding van ons gesprek van 2 september: een website met reserveringsflow, bevestigingsmails en een beheeromgeving voor de praktijk.",
    lines: [
      { id: "l1", description: "Website met reserveringen: ontwerp, bouw en livegang", quantityHundredths: 100, unitPriceCents: 249500, vatRate: 21 },
      { id: "l2", description: "Herinneringsmails en automatisering", quantityHundredths: 100, unitPriceCents: 25000, vatRate: 21 },
      { id: "l3", description: "Koppeling met agenda", quantityHundredths: 100, unitPriceCents: 65000, vatRate: 21 },
    ],
    notes: "Geldig tot 3 oktober 2026. Technisch beheer vanaf € 35 per maand wordt apart overeengekomen.",
    updatedAt: "2026-09-03T11:30:00+02:00",
  },
  {
    id: "quote-2026-0006",
    number: issuedDocumentNumber("quote", 2026, 6),
    status: "accepted",
    customer: customer("cust-2026-005"),
    issueDate: "2026-08-25",
    validUntil: "2026-09-24",
    subject: "Compacte website Smit Coaching",
    intro: "",
    lines: [
      { id: "l1", description: "Compacte website (1 tot 5 pagina's), eigen ontwerp", quantityHundredths: 100, unitPriceCents: 69500, vatRate: 21 },
      { id: "l2", description: "Subtiele animatie en interactie", quantityHundredths: 100, unitPriceCents: 17500, vatRate: 21 },
    ],
    notes: "",
    updatedAt: "2026-08-28T09:10:00+02:00",
  },
  {
    id: "quote-2026-0005",
    number: issuedDocumentNumber("quote", 2026, 5),
    status: "draft",
    customer: customer("cust-2026-006"),
    issueDate: "2026-09-09",
    validUntil: "2026-10-09",
    subject: "Tweede taal en extra pagina's",
    intro: "Uitbreiding van de bestaande website met een Arabische versie en twee extra dienstpagina's.",
    lines: [
      { id: "l1", description: "Tweede taal (Arabisch, rechts-naar-links)", quantityHundredths: 100, unitPriceCents: 20000, vatRate: 21 },
      { id: "l2", description: "Extra pagina", quantityHundredths: 200, unitPriceCents: 7500, vatRate: 21 },
      { id: "l3", description: "Vertaling en redactie door externe vertaler (doorbelast)", quantityHundredths: 100, unitPriceCents: 42000, vatRate: 9 },
    ],
    notes: "",
    updatedAt: "2026-09-09T16:45:00+02:00",
  },
];
