import { testCustomer } from "@/lib/payments/fixtures";
import type { QuoteRow } from "@/lib/admin/quotes/mapper";
import type { Quote } from "@/lib/admin/quotes/types";

/**
 * Quotes for tests, in both shapes the code reads them: the domain object a
 * screen or action holds, and the row the fake database stores.
 */

/** A concept as the builder leaves it: provisional number, nothing issued. */
export function quoteFixture(overrides: Partial<Quote> = {}): Quote {
  return {
    id: "quo-1",
    number: { value: "OFF-CONCEPT-X", provisional: true },
    status: "draft",
    customer: testCustomer,
    issueDate: "2026-09-01",
    validUntil: "2026-10-01",
    subject: "Nieuwe website",
    intro: "",
    lines: [{ id: "l1", description: "Ontwerp", quantityHundredths: 100, unitPriceCents: 150000, vatRate: 21 }],
    notes: "",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

/** The row `issueQuoteDocument` reads back after numbering, with its lines inline. */
export function quoteRowFixture(quote: Quote): QuoteRow & { created_at: string } {
  return {
    id: quote.id,
    number_value: quote.number.value,
    number_provisional: quote.number.provisional,
    status: quote.status,
    customer_id: quote.customer.customerId,
    customer_company_name: quote.customer.companyName,
    customer_contact_name: quote.customer.contactName,
    customer_email: quote.customer.email,
    customer_street: quote.customer.street,
    customer_postal_code: quote.customer.postalCode,
    customer_city: quote.customer.city,
    customer_country: quote.customer.country,
    customer_kvk_number: quote.customer.kvkNumber ?? null,
    customer_vat_number: quote.customer.vatNumber ?? null,
    project_id: quote.projectId ?? null,
    issue_date: quote.issueDate,
    valid_until: quote.validUntil,
    subject: quote.subject,
    intro: quote.intro,
    notes: quote.notes,
    terms_edition: quote.terms?.edition ?? null,
    terms_published_on: quote.terms?.publishedOn ?? null,
    document_path: quote.document?.path ?? null,
    document_sha256: quote.document?.sha256 ?? null,
    document_bytes: quote.document?.bytes ?? null,
    document_generated_at: quote.document?.generatedAt ?? null,
    supersedes_quote_id: quote.supersedesQuoteId ?? null,
    legacy_sent_without_document: quote.legacyWithoutDocument ?? false,
    sent_at: quote.sentAt ?? null,
    recipient_email: quote.recipientEmail ?? null,
    created_at: quote.updatedAt,
    updated_at: quote.updatedAt,
    quote_lines: quote.lines.map((line, position) => ({
      id: line.id,
      position,
      description: line.description,
      quantity_hundredths: line.quantityHundredths,
      unit_price_cents: line.unitPriceCents,
      vat_rate: line.vatRate,
    })),
  };
}

/**
 * The two issue functions, as they behave in Postgres, against the in-memory
 * `quotes` table of `createFakeDb`. The number is taken once and the terms
 * are written with it; the artifact is written once and a later caller is
 * handed the first one; a legacy quote is refused outright.
 */
export function createQuoteIssueRpc(rows: () => Record<string, unknown>[], nextNumber: () => string) {
  return async (name: string, args: Record<string, unknown> = {}) => {
    const quote = rows().find((row) => row.id === args.p_quote_id);
    if (!quote) return { data: null, error: { message: "Onbekende offerte." } };

    if (name === "begin_quote_issue") {
      if (!args.p_terms_edition || !args.p_terms_published_on) {
        return { data: null, error: { message: "De toepasselijke voorwaardenversie ontbreekt; zonder die wordt geen offerte uitgegeven." } };
      }
      if (quote.legacy_sent_without_document) {
        return {
          data: null,
          error: {
            message: `Offerte ${quote.number_value} is verzonden voordat documenten werden opgeslagen en wordt niet opnieuw uitgegeven; maak een nieuwe versie.`,
          },
        };
      }
      if (quote.number_provisional) {
        quote.number_value = nextNumber();
        quote.number_provisional = false;
        quote.terms_edition = args.p_terms_edition;
        quote.terms_published_on = args.p_terms_published_on;
      } else if (quote.terms_edition == null) {
        quote.terms_edition = args.p_terms_edition;
        quote.terms_published_on = args.p_terms_published_on;
      }
      return { data: quote.number_value, error: null };
    }

    if (name === "complete_quote_issue") {
      if (quote.number_provisional) {
        return { data: null, error: { message: `Offerte ${quote.number_value} heeft nog geen definitief nummer.` } };
      }
      if (quote.document_path) {
        if (quote.document_path !== args.p_path || quote.document_sha256 !== args.p_sha256 || quote.document_bytes !== args.p_bytes) {
          return {
            data: null,
            error: { message: `Offerte ${quote.number_value} heeft al een definitieve PDF; een afwijkend document wordt niet vastgelegd.` },
          };
        }
      } else {
        quote.document_path = args.p_path;
        quote.document_sha256 = args.p_sha256;
        quote.document_bytes = args.p_bytes;
        quote.document_generated_at = "2026-09-20T09:00:01.000Z";
      }
      return {
        data: {
          number: quote.number_value,
          path: quote.document_path,
          sha256: quote.document_sha256,
          bytes: quote.document_bytes,
          adopted: true,
        },
        error: null,
      };
    }

    return { data: null, error: { message: `rpc ${name} not provided` } };
  };
}
