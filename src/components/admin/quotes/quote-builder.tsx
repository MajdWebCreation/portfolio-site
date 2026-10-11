"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import AdminSection from "@/components/admin/admin-section";
import CustomerSelect from "@/components/admin/documents/customer-select";
import DocumentPanel from "@/components/admin/documents/document-panel";
import DocumentTotalsView from "@/components/admin/documents/document-totals";
import LineItemsEditor, { newLine } from "@/components/admin/documents/line-items-editor";
import ProjectSelect from "@/components/admin/documents/project-select";
import SendPanel from "@/components/admin/documents/send-panel";
import { TextField, TextareaField } from "@/components/admin/form-field";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import type { RecipientResult } from "@/lib/admin/communications/recipient";
import type { Customer } from "@/lib/admin/customers/types";
import { provisionalDocumentNumber } from "@/lib/admin/documents/numbering";
import { snapshotCustomer } from "@/lib/admin/documents/types";
import { addDays, hasLineErrors, validateDates, validateLine, type LineErrors } from "@/lib/admin/documents/validation";
import type { Project } from "@/lib/admin/projects/types";
import { saveQuote } from "@/lib/admin/quotes/actions";
import { quoteStatusLabels, quoteStatusTone, type Quote } from "@/lib/admin/quotes/types";
import { calculateTotals } from "@/lib/money";

type Errors = Partial<Record<"customer" | "issueDate" | "validUntil" | "subject" | "lines", string>>;

function blank(todayKey: string, seed: string, lineId: string): Quote {
  return {
    id: "",
    number: provisionalDocumentNumber("quote", seed),
    status: "draft",
    customer: { customerId: "", companyName: "", contactName: "", email: "", street: "", postalCode: "", city: "", country: "" },
    issueDate: todayKey,
    validUntil: addDays(todayKey, 30),
    subject: "",
    intro: "",
    lines: [newLine(lineId)],
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

function validate(quote: Quote): { errors: Errors; lineErrors: Record<string, LineErrors> } {
  const errors: Errors = {};
  if (!quote.customer.customerId) errors.customer = "Kies een klant.";
  const dates = validateDates(quote.issueDate, quote.validUntil, "De geldigheidsdatum");
  if (dates.issueDate) errors.issueDate = dates.issueDate;
  if (dates.laterDate) errors.validUntil = dates.laterDate;
  if (!quote.subject.trim()) errors.subject = "Vul een onderwerp in.";
  const lineErrors: Record<string, LineErrors> = {};
  quote.lines.forEach((line) => {
    const result = validateLine(line);
    if (hasLineErrors(result)) lineErrors[line.id] = result;
  });
  if (quote.lines.length === 0) errors.lines = "Voeg minstens één regel toe.";
  else if (Object.keys(lineErrors).length > 0) errors.lines = "Controleer de gemarkeerde regels.";
  return { errors, lineErrors };
}

type QuoteBuilderProps = {
  stored: Quote | null;
  customers: Customer[];
  projects: Project[];
  todayKey: string;
  /** Where the stored quote's mail goes now, resolved by the page; absent for a new quote. */
  recipient?: RecipientResult;
  /** The sent quote this concept is a new version of, when it is one. */
  predecessor?: Pick<Quote, "id" | "number">;
};

export default function QuoteBuilder({ stored, customers, projects, todayKey, recipient, predecessor }: QuoteBuilderProps) {
  const router = useRouter();
  // "NIEUW" until the record is created; both server and client render the same number.
  const [quote, setQuote] = useState<Quote>(() => stored ?? blank(todayKey, "nieuw", "offerte-regel-1"));
  const [errors, setErrors] = useState<Errors>({});
  const [lineErrors, setLineErrors] = useState<Record<string, LineErrors>>({});
  const { save: runSave, pending, error: saveError, savedAt } = useSave();
  const totals = useMemo(() => calculateTotals(quote.lines.filter((line) => !hasLineErrors(validateLine(line)))), [quote.lines]);
  const ready = Boolean(quote.customer.customerId) && quote.lines.length > 0 && quote.lines.every((line) => !hasLineErrors(validateLine(line)));
  // Only the customer on the document has projects to offer; a project of
  // another customer has no row for the composite key to match.
  const customerProjects = useMemo(
    () => projects.filter((project) => project.customerId === quote.customer.customerId),
    [projects, quote.customer.customerId],
  );

  const update = <K extends keyof Quote>(field: K, value: Quote[K]) => {
    setQuote((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => (field in previous ? { ...previous, [field]: undefined } : previous));
  };

  function save() {
    const result = validate(quote);
    setErrors(result.errors);
    setLineErrors(result.lineErrors);
    const first = Object.keys(result.errors)[0];
    if (first) {
      document.getElementById(first === "lines" ? "lines-heading" : first)?.focus();
      return;
    }
    const isNew = !quote.id;
    const numberValue = isNew ? provisionalDocumentNumber("quote", Date.now().toString(36).slice(-5)).value : quote.number.value;

    runSave(
      () =>
        saveQuote(quote.id || null, {
          customer: quote.customer,
          projectId: quote.projectId,
          issueDate: quote.issueDate,
          validUntil: quote.validUntil,
          subject: quote.subject,
          intro: quote.intro,
          lines: quote.lines,
          notes: quote.notes,
        }, numberValue),
      (savedId: string) => {
        if (isNew) router.push(`/admin/offertes/${savedId}`);
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

        <AdminSection id="document" title="Offerte" note={quote.number.provisional ? "Conceptnummer; het definitieve YM-O-nummer wordt toegekend bij versturen" : undefined}>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField id="number" label="Offertenummer" value={quote.number.value} readOnly className="font-mono text-[0.9rem] text-muted" hint={quote.number.provisional ? "Voorlopig; het definitieve nummer komt uit de reeks per jaar." : undefined} />
            <div className="grid grid-cols-2 gap-5">
              <TextField id="issueDate" label="Offertedatum" type="date" value={quote.issueDate} onChange={(event) => update("issueDate", event.target.value)} error={errors.issueDate} />
              <TextField id="validUntil" label="Geldig tot" type="date" value={quote.validUntil} onChange={(event) => update("validUntil", event.target.value)} error={errors.validUntil} />
            </div>
            <div className="sm:col-span-2">
              <CustomerSelect
                customers={customers}
                value={quote.customer.customerId ? quote.customer : null}
                onSelect={(customer) => {
                  update("customer", customer ? snapshotCustomer(customer) : blank(todayKey, "x", "x").customer);
                  // A project of the previous customer would not survive the save.
                  update("projectId", undefined);
                }}
                error={errors.customer}
              />
            </div>
            <div className="sm:col-span-2">
              <ProjectSelect
                projects={customerProjects}
                value={quote.projectId ?? ""}
                onChange={(projectId) => update("projectId", projectId || undefined)}
                disabled={!quote.customer.customerId}
              />
            </div>
            <div className="sm:col-span-2">
              <TextField id="subject" label="Onderwerp" value={quote.subject} onChange={(event) => update("subject", event.target.value)} error={errors.subject} placeholder="Bijvoorbeeld: Website met online afspraken" />
            </div>
            <div className="sm:col-span-2">
              <TextareaField id="intro" label="Inleiding" optional value={quote.intro} onChange={(event) => update("intro", event.target.value)} className="min-h-20" hint="Staat boven de regels op de offerte." />
            </div>
          </div>
        </AdminSection>

        <AdminSection id="lines-heading" title="Regels" note={errors.lines}>
          <LineItemsEditor lines={quote.lines} onChange={(lines) => { update("lines", lines); setLineErrors({}); }} errors={lineErrors} />
          <div className="mt-6">
            <DocumentTotalsView totals={totals} />
          </div>
        </AdminSection>

        <AdminSection id="notes" title="Opmerkingen en voorwaarden">
          <TextareaField id="quote-notes" label="Opmerkingen" optional value={quote.notes} onChange={(event) => update("notes", event.target.value)} hint="Staat onder de totalen op de offerte." />
        </AdminSection>
      </div>

      <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8">
        <SaveControls
          label={quote.id ? "Concept bijwerken" : "Offerte aanmaken"}
          pending={pending}
          error={saveError}
          savedAt={savedAt}
          onSave={save}
        />
        <div className="space-y-3 border-t border-line pt-6">
          <StatusBadge tone={quoteStatusTone[quote.status]}>{quoteStatusLabels[quote.status]}</StatusBadge>
          <p className="text-[0.82rem] leading-snug text-muted">
            Een concept wordt verzonden door het te versturen; daarna ligt de inhoud vast en kun je vastleggen wat de
            klant besloot.
          </p>
          {predecessor ? (
            <p className="text-[0.82rem] leading-snug text-muted">
              Nieuwe versie van{" "}
              <Link href={`/admin/offertes/${predecessor.id}`} className="link-static text-ink">
                {predecessor.number.value}
              </Link>
              .
            </p>
          ) : null}
        </div>
        <div className="border-t border-line pt-6">
          <DocumentPanel
            document={{ kind: "quote", quote }}
            fileName={`${quote.number.value}.pdf`}
            ready={ready}
            action={
              <SendPanel
                doc={{ kind: "quote", quote }}
                recipient={recipient ?? { ok: false, reason: "Sla de offerte eerst op." }}
              />
            }
          />
        </div>
      </aside>
    </div>
  );
}
