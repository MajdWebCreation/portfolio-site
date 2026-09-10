import { customerFixtures } from "@/lib/admin/customers/fixtures";
import { issuedDocumentNumber } from "@/lib/admin/documents/numbering";
import { snapshotCustomer } from "@/lib/admin/documents/types";
import type { Invoice } from "@/lib/admin/invoices/types";

const customer = (id: string) => {
  const found = customerFixtures.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown customer fixture ${id}`);
  return snapshotCustomer(found);
};

/** Fictional invoices for development. */
export const invoiceFixtures: Invoice[] = [
  {
    id: "invoice-2026-0012",
    number: issuedDocumentNumber("invoice", 2026, 12),
    status: "sent",
    customer: customer("cust-2026-005"),
    issueDate: "2026-09-01",
    dueDate: "2026-09-15",
    paymentReference: "FAC-2026-0012",
    lines: [
      { id: "l1", description: "Compacte website (1 tot 5 pagina's), eigen ontwerp", quantityHundredths: 100, unitPriceCents: 69500, vatRate: 21 },
      { id: "l2", description: "Subtiele animatie en interactie", quantityHundredths: 100, unitPriceCents: 17500, vatRate: 21 },
    ],
    notes: "",
    quoteId: "quote-2026-0006",
    updatedAt: "2026-09-01T10:00:00+02:00",
  },
  {
    id: "invoice-2026-0011",
    number: issuedDocumentNumber("invoice", 2026, 11),
    status: "overdue",
    customer: customer("cust-2025-004"),
    issueDate: "2026-08-01",
    dueDate: "2026-08-15",
    paymentReference: "FAC-2026-0011",
    lines: [
      { id: "l1", description: "Technisch beheer, juli 2026", quantityHundredths: 100, unitPriceCents: 4900, vatRate: 21 },
      { id: "l2", description: "Kleine wijziging na nazorgperiode", quantityHundredths: 300, unitPriceCents: 1000, vatRate: 21 },
    ],
    notes: "Beheer is per 1 juli 2026 opgezegd; dit is de laatste beheerfactuur.",
    updatedAt: "2026-08-01T09:00:00+02:00",
  },
  {
    id: "invoice-2026-0010",
    number: issuedDocumentNumber("invoice", 2026, 10),
    status: "paid",
    customer: customer("cust-2026-006"),
    issueDate: "2026-07-20",
    dueDate: "2026-08-03",
    paymentReference: "FAC-2026-0010",
    lines: [{ id: "l1", description: "Compacte website, ontwerp en bouw", quantityHundredths: 100, unitPriceCents: 69500, vatRate: 21 }],
    notes: "",
    updatedAt: "2026-08-02T14:20:00+02:00",
  },
];
