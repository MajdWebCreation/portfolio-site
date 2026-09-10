"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import AdminSection from "@/components/admin/admin-section";
import CustomerSelect from "@/components/admin/documents/customer-select";
import DocumentStatus from "@/components/admin/documents/document-status";
import DocumentTotalsView from "@/components/admin/documents/document-totals";
import LineItemsEditor, { newLine } from "@/components/admin/documents/line-items-editor";
import { TextField, TextareaField } from "@/components/admin/form-field";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import type { Customer } from "@/lib/admin/customers/types";
import { companyProfile } from "@/lib/admin/documents/company";
import { provisionalDocumentNumber } from "@/lib/admin/documents/numbering";
import { snapshotCustomer } from "@/lib/admin/documents/types";
import { addDays, hasLineErrors, validateDates, validateLine, type LineErrors } from "@/lib/admin/documents/validation";
import { saveInvoice } from "@/lib/admin/invoices/actions";
import { invoiceStatusLabels, invoiceStatusOrder, invoiceStatusTone, isInvoiceStatus, type Invoice } from "@/lib/admin/invoices/types";
import { calculateTotals } from "@/lib/money";

const PdfPanel = dynamic(() => import("@/components/admin/documents/pdf-panel"), { ssr: false, loading: () => <p className="text-[0.85rem] text-muted">PDF-module laden…</p> });

type Errors = Partial<Record<"customer" | "issueDate" | "dueDate" | "lines", string>>;

function blank(todayKey: string, seed: string, lineId: string): Invoice {
  const number = provisionalDocumentNumber("invoice", seed);
  return {
    id: "",
    number,
    status: "draft",
    customer: { customerId: "", companyName: "", contactName: "", email: "", street: "", postalCode: "", city: "", country: "" },
    issueDate: todayKey,
    // The general terms set payment at 14 calendar days after the invoice date.
    dueDate: addDays(todayKey, companyProfile.paymentTermDays),
    paymentReference: number.value,
    lines: [newLine(lineId)],
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

function validate(invoice: Invoice): { errors: Errors; lineErrors: Record<string, LineErrors> } {
  const errors: Errors = {};
  if (!invoice.customer.customerId) errors.customer = "Kies een klant.";
  const dates = validateDates(invoice.issueDate, invoice.dueDate, "De vervaldatum");
  if (dates.issueDate) errors.issueDate = dates.issueDate;
  if (dates.laterDate) errors.dueDate = dates.laterDate;
  const lineErrors: Record<string, LineErrors> = {};
  invoice.lines.forEach((line) => {
    const result = validateLine(line);
    if (hasLineErrors(result)) lineErrors[line.id] = result;
  });
  if (invoice.lines.length === 0) errors.lines = "Voeg minstens één regel toe.";
  else if (Object.keys(lineErrors).length > 0) errors.lines = "Controleer de gemarkeerde regels.";
  return { errors, lineErrors };
}

type InvoiceBuilderProps = { stored: Invoice | null; customers: Customer[]; todayKey: string };

export default function InvoiceBuilder({ stored, customers, todayKey }: InvoiceBuilderProps) {
  const router = useRouter();
  // "NIEUW" until the record is created; both server and client render the same number.
  const [invoice, setInvoice] = useState<Invoice>(() => stored ?? blank(todayKey, "nieuw", "factuur-regel-1"));
  const [errors, setErrors] = useState<Errors>({});
  const [lineErrors, setLineErrors] = useState<Record<string, LineErrors>>({});
  const { save: runSave, pending, error: saveError, savedAt } = useSave();
  const totals = useMemo(() => calculateTotals(invoice.lines.filter((line) => !hasLineErrors(validateLine(line)))), [invoice.lines]);
  const ready = Boolean(invoice.customer.customerId) && invoice.lines.length > 0 && invoice.lines.every((line) => !hasLineErrors(validateLine(line)));

  const update = <K extends keyof Invoice>(field: K, value: Invoice[K]) => {
    setInvoice((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => (field in previous ? { ...previous, [field]: undefined } : previous));
  };

  function save() {
    const result = validate(invoice);
    setErrors(result.errors);
    setLineErrors(result.lineErrors);
    const first = Object.keys(result.errors)[0];
    if (first) {
      document.getElementById(first === "lines" ? "lines-heading" : first)?.focus();
      return;
    }
    const isNew = !invoice.id;
    const number = isNew ? provisionalDocumentNumber("invoice", Date.now().toString(36).slice(-5)) : invoice.number;
    // A reference the admin never changed follows the number.
    const paymentReference =
      isNew && invoice.paymentReference === invoice.number.value ? number.value : invoice.paymentReference;

    runSave(
      () =>
        saveInvoice(invoice.id || null, {
          status: invoice.status,
          customer: invoice.customer,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          paymentReference,
          lines: invoice.lines,
          notes: invoice.notes,
        }, number.value),
      (savedId: string) => {
        if (isNew) router.push(`/admin/facturen/${savedId}`);
      },
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="space-y-10">
        {Object.values(errors).filter(Boolean).length > 0 ? (
          <p role="alert" className="border-l-2 border-danger pl-3 text-[0.9rem] text-danger">
            Controleer de gemarkeerde velden.
          </p>
        ) : null}

        <AdminSection id="document" title="Factuur" note={invoice.number.provisional ? "Conceptnummer; het definitieve YM-F-nummer wordt toegekend bij versturen" : undefined}>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField id="number" label="Factuurnummer" value={invoice.number.value} readOnly className="font-mono text-[0.9rem] text-muted" hint={invoice.number.provisional ? "Voorlopig; het definitieve nummer komt uit de reeks per jaar." : undefined} />
            <div className="grid grid-cols-2 gap-5">
              <TextField id="issueDate" label="Factuurdatum" type="date" value={invoice.issueDate} onChange={(event) => { update("issueDate", event.target.value); if (!invoice.id) update("dueDate", addDays(event.target.value, companyProfile.paymentTermDays)); }} error={errors.issueDate} />
              <TextField id="dueDate" label="Vervaldatum" type="date" value={invoice.dueDate} onChange={(event) => update("dueDate", event.target.value)} error={errors.dueDate} hint={`Voorstel: ${companyProfile.paymentTermDays} dagen, uit de voorwaarden.`} />
            </div>
            <div className="sm:col-span-2">
              <CustomerSelect customers={customers} value={invoice.customer.customerId ? invoice.customer : null} onSelect={(customer) => update("customer", customer ? snapshotCustomer(customer) : blank(todayKey, "x", "x").customer)} error={errors.customer} />
            </div>
            <div className="sm:col-span-2">
              <TextField id="paymentReference" label="Betalingskenmerk" value={invoice.paymentReference} onChange={(event) => update("paymentReference", event.target.value)} hint="Wat de klant bij de betaling vermeldt; standaard het factuurnummer." className="font-mono text-[0.9rem]" />
            </div>
          </div>
        </AdminSection>

        <AdminSection id="lines-heading" title="Regels" note={errors.lines}>
          <LineItemsEditor lines={invoice.lines} onChange={(lines) => { update("lines", lines); setLineErrors({}); }} errors={lineErrors} />
          <div className="mt-6">
            <DocumentTotalsView totals={totals} />
          </div>
        </AdminSection>

        <AdminSection id="notes" title="Opmerkingen">
          <TextareaField id="invoice-notes" label="Opmerkingen" optional value={invoice.notes} onChange={(event) => update("notes", event.target.value)} hint="Staat onder de betaalinformatie op de factuur." />
        </AdminSection>
      </div>

      <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8">
        <SaveControls
          label={invoice.id ? "Concept bijwerken" : "Factuur aanmaken"}
          pending={pending}
          error={saveError}
          savedAt={savedAt}
          onSave={save}
        />
        <div className="border-t border-line pt-6">
          <DocumentStatus value={invoice.status} order={invoiceStatusOrder} labels={invoiceStatusLabels} tones={invoiceStatusTone} onChange={(value) => (isInvoiceStatus(value) ? update("status", value) : null)} edited={false} />
        </div>
        <div className="border-t border-line pt-6">
          <PdfPanel document={{ kind: "invoice", invoice }} fileName={`${invoice.number.value}.pdf`} ready={ready} />
        </div>
      </aside>
    </div>
  );
}
