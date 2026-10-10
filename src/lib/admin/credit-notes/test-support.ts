import { randomUUID } from "node:crypto";
import type { FakeRpc, FakeTrigger } from "@/lib/payments/fixtures";
import { roundHalfUp } from "@/lib/money";

/**
 * The three credit-note functions of the migration, as the fake database
 * runs them: the same checks, in TypeScript, so a flow test exercises the
 * caps and the numbering without Postgres. The SQL stays the real thing;
 * this mirrors it closely enough that a test which would fail there fails
 * here (see credit-notes.test.ts, which pins the behaviours one by one).
 */
type Row = Record<string, unknown>;

const lineNet = (line: Row) => roundHalfUp((Number(line.quantity_hundredths) * Number(line.unit_price_cents)) / 100);

export function creditNoteRpc(counter: { next: number } = { next: 1 }): FakeRpc {
  return async (name, args, db) => {
    if (name === "create_credit_note") {
      const invoice = db.rows("invoices").find((row) => row.id === args.p_invoice_id);
      if (!invoice) return { data: null, error: { code: "P0002", message: "Onbekende factuur." } };
      if (!invoice.sent_at) return { data: null, error: { code: "23514", message: `Factuur ${invoice.number_value} is nooit verstuurd; een niet-verstuurde factuur annuleer je in plaats van hem te crediteren.` } };
      if (invoice.status === "cancelled") return { data: null, error: { code: "23514", message: `Factuur ${invoice.number_value} is geannuleerd en kan niet worden gecrediteerd.` } };
      const lines = args.p_lines as { description: string; quantityHundredths: number; unitPriceCents: number; vatRate: number }[];
      if (!Array.isArray(lines) || lines.length === 0) return { data: null, error: { code: "23514", message: "Een creditnota heeft minstens één regel." } };
      const source = (args.p_source as string) ?? "manual";
      const serviceId = (args.p_recurring_service_id as string | undefined) ?? null;
      if (source === "cancellation_credit" && db.rows("credit_notes").some((row) => row.source === "cancellation_credit" && row.recurring_service_id === serviceId)) {
        return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint credit_notes_cancellation_unique" } };
      }
      const id = randomUUID();
      const newLines = lines.map((line, position) => ({
        id: `${id}-${position}`,
        credit_note_id: id,
        position,
        description: line.description,
        quantity_hundredths: line.quantityHundredths,
        unit_price_cents: line.unitPriceCents,
        vat_rate: line.vatRate,
      }));
      const subtotal = newLines.reduce((sum, line) => sum + lineNet(line), 0);
      if (subtotal !== args.p_subtotal_cents || subtotal <= 0) return { data: null, error: { code: "23514", message: "Het subtotaal van de creditnota komt niet overeen met de regels." } };
      for (const rate of new Set(newLines.map((line) => line.vat_rate))) {
        const invoiced = db.rows("invoice_lines").filter((line) => line.invoice_id === invoice.id && line.vat_rate === rate).reduce((sum, line) => sum + lineNet(line), 0);
        const credited = db
          .rows("credit_note_lines")
          .filter((line) => line.vat_rate === rate && db.rows("credit_notes").some((note) => note.id === line.credit_note_id && note.invoice_id === invoice.id))
          .reduce((sum, line) => sum + lineNet(line), 0);
        const fresh = newLines.filter((line) => line.vat_rate === rate).reduce((sum, line) => sum + lineNet(line), 0);
        if (credited + fresh > invoiced) {
          return { data: null, error: { code: "23514", message: `Er wordt meer gecrediteerd dan factuur ${invoice.number_value} bij ${rate} % btw in rekening bracht (al gecrediteerd: ${credited} cent, deze creditnota: ${fresh} cent, gefactureerd: ${invoiced} cent).` } };
        }
      }
      db.rows("credit_notes").push({
        id,
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        number_value: `CN-CONCEPT-${id.slice(0, 8).toUpperCase()}`,
        number_provisional: true,
        status: "issued",
        reason: String(args.p_reason).trim(),
        issue_date: args.p_issue_date,
        source,
        recurring_service_id: serviceId,
        customer_company_name: invoice.customer_company_name,
        customer_contact_name: invoice.customer_contact_name,
        customer_email: invoice.customer_email,
        customer_street: invoice.customer_street,
        customer_postal_code: invoice.customer_postal_code,
        customer_city: invoice.customer_city,
        customer_country: invoice.customer_country,
        customer_kvk_number: invoice.customer_kvk_number ?? null,
        customer_vat_number: invoice.customer_vat_number ?? null,
        subtotal_cents: args.p_subtotal_cents,
        vat_cents: args.p_vat_cents,
        total_cents: args.p_total_cents,
        currency: "EUR",
        finalizing_at: null,
        issued_at: null,
        document_path: null,
        document_sha256: null,
        document_bytes: null,
        document_generated_at: null,
        sent_at: null,
        recipient_email: null,
        created_by: null,
        created_at: new Date(2026, 9, 10, 10, 0, 0, db.rows("credit_notes").length).toISOString(),
        updated_at: "2026-10-10T10:00:00.000Z",
      });
      db.rows("credit_note_lines").push(...newLines);
      return { data: id, error: null };
    }
    if (name === "begin_credit_note_issue") {
      const note = db.rows("credit_notes").find((row) => row.id === args.p_credit_note_id);
      if (!note) return { data: null, error: { code: "P0002", message: "Onbekende creditnota." } };
      if (note.finalizing_at) return { data: note.number_value, error: null };
      const year = String(note.issue_date).slice(0, 4);
      note.number_value = `YM-C-${year}-${String(counter.next).padStart(6, "0")}`;
      counter.next += 1;
      note.number_provisional = false;
      note.finalizing_at = "2026-10-10T10:00:01.000Z";
      return { data: note.number_value, error: null };
    }
    if (name === "complete_credit_note_issue") {
      const note = db.rows("credit_notes").find((row) => row.id === args.p_credit_note_id);
      if (!note) return { data: null, error: { code: "P0002", message: "Onbekende creditnota." } };
      if (!note.finalizing_at) return { data: null, error: { code: "23514", message: "geen nummer" } };
      if (note.issued_at) {
        if (note.document_sha256 !== args.p_sha256) return { data: null, error: { code: "23514", message: `Creditnota ${note.number_value} heeft al een definitieve PDF.` } };
        return { data: { number: note.number_value, path: note.document_path, sha256: note.document_sha256, bytes: note.document_bytes, adopted: true }, error: null };
      }
      Object.assign(note, {
        issued_at: "2026-10-10T10:00:02.000Z",
        document_path: args.p_path,
        document_sha256: args.p_sha256,
        document_bytes: args.p_bytes,
        document_generated_at: "2026-10-10T10:00:02.000Z",
      });
      return { data: { number: note.number_value, path: args.p_path, sha256: args.p_sha256, bytes: args.p_bytes, adopted: false }, error: null };
    }
    return { data: null, error: { message: `rpc ${name} not provided` } };
  };
}

/** A sent, paid-style invoice row of EUR 100 net at 21%, with its line, for the fake database. */
export function invoiceRowFixture(overrides: Row = {}): { invoice: Row; lines: Row[] } {
  const id = (overrides.id as string) ?? "inv-1";
  return {
    invoice: {
      id,
      number_value: "YM-F-2026-000001",
      number_provisional: false,
      status: "paid",
      customer_id: "cust-1",
      customer_company_name: "Alfa BV",
      customer_contact_name: "A. Alfa",
      customer_email: "a@example.com",
      customer_street: "Straat 1",
      customer_postal_code: "1011 AA",
      customer_city: "Amsterdam",
      customer_country: "Nederland",
      customer_kvk_number: null,
      customer_vat_number: null,
      project_id: null,
      recurring_service_id: null,
      billing_period_start: null,
      billing_period_end: null,
      issue_date: "2026-09-01",
      due_date: "2026-09-15",
      finalizing_at: "2026-09-01T09:00:00.000Z",
      issued_at: "2026-09-01T09:00:00.000Z",
      activation_note: null,
      document_path: "2026/YM-F-2026-000001-abc.pdf",
      document_sha256: "a".repeat(64),
      document_bytes: 100,
      document_generated_at: "2026-09-01T09:00:00.000Z",
      payment_reference: "YM-F-2026-000001",
      notes: "",
      quote_id: null,
      sent_at: "2026-09-01T09:05:00.000Z",
      recipient_email: "a@example.com",
      created_at: "2026-09-01T08:00:00.000Z",
      updated_at: "2026-09-01T10:00:00.000Z",
      ...overrides,
    },
    lines: [{ id: `${id}-l1`, invoice_id: id, position: 0, description: "Werk", quantity_hundredths: 100, unit_price_cents: 10000, vat_rate: 21 }],
  };
}

/**
 * `private.refuse_excess_refund`, as the fake database runs it. The same
 * four checks in the same order as the SQL, on the row as it would be
 * written. Postgres serialises on the invoice row; here every write is
 * already serial, so the order the checks see is the order the test wrote.
 */
export const refundTrigger: FakeTrigger = (table, next, db) => {
  if (table !== "refunds") return null;
  if (next.status === "failed" || next.status === "canceled") return null;
  const refuse = (message: string) => ({ code: "23514", message });
  const note = db.rows("credit_notes").find((row) => row.id === next.credit_note_id && row.invoice_id === next.invoice_id);
  if (!note) return refuse("De creditnota hoort niet bij deze factuur.");
  if (!note.issued_at || !note.document_path) return refuse(`Creditnota ${note.number_value} is nog niet afgerond; er kan pas worden terugbetaald als het document bestaat.`);
  const live = (rows: Row[]) => rows.filter((row) => row.id !== next.id && row.status !== "failed" && row.status !== "canceled");
  const amount = Number(next.amount_cents);
  const onNote = live(db.rows("refunds").filter((row) => row.credit_note_id === next.credit_note_id)).reduce((sum, row) => sum + Number(row.amount_cents), 0);
  if (onNote + amount > Number(note.total_cents)) return refuse(`Er wordt meer terugbetaald (${onNote + amount} cent) dan creditnota ${note.number_value} crediteert (${note.total_cents} cent).`);
  const onInvoice = live(db.rows("refunds").filter((row) => row.invoice_id === next.invoice_id)).reduce((sum, row) => sum + Number(row.amount_cents), 0);
  const issuedCredits = db.rows("credit_notes").filter((row) => row.invoice_id === next.invoice_id && row.issued_at && row.document_path).reduce((sum, row) => sum + Number(row.total_cents), 0);
  if (onInvoice + amount > issuedCredits) return refuse(`Er wordt meer terugbetaald (${onInvoice + amount} cent) dan er op de factuur is gecrediteerd (${issuedCredits} cent).`);
  const paid = db.rows("payments").filter((row) => row.invoice_id === next.invoice_id && row.status === "paid").reduce((sum, row) => sum + Number(row.amount_cents), 0);
  if (onInvoice + amount > paid) return refuse(`Er wordt meer terugbetaald (${onInvoice + amount} cent) dan er op de factuur is betaald (${paid} cent).`);
  return null;
};
