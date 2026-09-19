import { Text, View } from "@react-pdf/renderer";
import { companyProfile } from "@/lib/admin/documents/company";
import type { InvoiceActivation } from "@/lib/admin/documents/types";
import type { Invoice } from "@/lib/admin/invoices/types";
import DocumentLayout, { formatDocumentDate } from "@/lib/admin/pdf/document-layout";
import { styles } from "@/lib/admin/pdf/theme";
import { formatCents } from "@/lib/money";

/*
  A monthly service this invoice switches on, for the note under the totals.
  The PDF stays the formal record of what is due now, so the monthly figure
  appears only in that note -- never as a line, never in a total. Re-exported
  because the shape is the documents module's, shared with the mail and with
  the admin's preview.
*/
export type { InvoiceActivation };

/**
 * The reference this document asks for. An invoice that goes out always has
 * one -- `finalize_invoice` settles it against the number the moment the
 * document is issued -- and the fallback covers a concept whose preview is
 * rendered with the field left empty.
 */
function paymentReferenceOf(invoice: Invoice): string {
  return invoice.paymentReference || invoice.number.value;
}

/** One bank detail: label left, value right, like the metadata at the top. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.row, styles.hairline, { paddingVertical: 3.5 }]}>
      <Text style={[styles.muted, { width: 62, flexShrink: 0 }]}>{label}</Text>
      <Text style={[styles.ink, { flex: 1 }]}>{value}</Text>
    </View>
  );
}

/**
 * What the customer is asked to quote when they transfer the money.
 *
 * Exported because it is the one sentence on the document that has to carry
 * the same reference as the metadata, the mail and our own row -- a mismatch
 * there is a payment nobody can match to an invoice, so it is asserted rather
 * than trusted.
 */
export function paymentInstruction(invoice: Invoice): string {
  return `Graag betalen vóór ${formatDocumentDate(invoice.dueDate)} onder vermelding van ${paymentReferenceOf(invoice)}.`;
}

/**
 * Payment block: the request in a sentence, the bank details as rows, so the
 * IBAN and the account holder read as data rather than running text. The BIC
 * row is omitted while no BIC is configured.
 */
function Payment({ invoice }: { invoice: Invoice }) {
  return (
    <View style={{ marginTop: 18 }} wrap={false}>
      <Text style={[styles.mono, { marginBottom: 5 }]}>Betaling</Text>
      <Text style={[styles.prose, { maxWidth: "88%" }]}>{paymentInstruction(invoice)}</Text>
      <View style={{ width: "56%", marginTop: 8 }}>
        <DetailRow label="IBAN" value={companyProfile.iban} />
        {companyProfile.bic ? <DetailRow label="BIC" value={companyProfile.bic} /> : null}
        <DetailRow label="T.n.v." value={companyProfile.accountHolder} />
      </View>
    </View>
  );
}

/**
 * The same block for an invoice that is collected rather than paid.
 *
 * A customer on direct debit must not be told to transfer money: they would
 * pay the same amount twice. So the bank details make way for what actually
 * happens, and the date is the invoice's own due date, which for a monthly
 * term is the day the subscription collects.
 */
function DirectDebit({ invoice }: { invoice: Invoice }) {
  return (
    <View style={{ marginTop: 18 }} wrap={false}>
      <Text style={[styles.mono, { marginBottom: 5 }]}>Betaling</Text>
      <Text style={[styles.prose, { maxWidth: "88%" }]}>
        Dit bedrag wordt op {formatDocumentDate(invoice.dueDate)} automatisch van uw rekening geïncasseerd door{" "}
        {companyProfile.legalName}, op basis van de afgegeven machtiging. U hoeft zelf niets over te maken.
      </Text>
      <View style={{ width: "56%", marginTop: 8 }}>
        <DetailRow label="Kenmerk" value={paymentReferenceOf(invoice)} />
        <DetailRow label="Incassant" value={companyProfile.accountHolder} />
      </View>
    </View>
  );
}

/**
 * A term the customer already paid, in the activation flow. Nothing is going
 * to be collected, so naming a future collection date would be wrong; the
 * document says what it is instead: settled.
 */
function Settled({ invoice }: { invoice: Invoice }) {
  return (
    <View style={{ marginTop: 18 }} wrap={false}>
      <Text style={[styles.mono, { marginBottom: 5 }]}>Betaling</Text>
      <Text style={[styles.prose, { maxWidth: "88%" }]}>
        Deze factuur is voldaan. U hoeft niets over te maken.
      </Text>
      <View style={{ width: "56%", marginTop: 8 }}>
        <DetailRow label="Kenmerk" value={paymentReferenceOf(invoice)} />
      </View>
    </View>
  );
}

/**
 * The note for a one-off invoice that also authorises a monthly collection.
 *
 * Paying this invoice does two things, and the customer is owed both in
 * writing. The danger is arithmetic: a monthly amount printed near a total
 * invites the reader to add it in. So it is kept out of the lines and out of
 * the totals, and this paragraph says in as many words that the amount below
 * the totals is what is due now, with the monthly amount collected separately
 * from a date that is named.
 */
export function activationNote(activates: InvoiceActivation): string {
  return (
    `Door deze factuur te betalen machtigt u ${companyProfile.legalName} om ${activates.serviceName} maandelijks ` +
    `automatisch te incasseren: ${formatCents(activates.monthlyGrossCents)} per maand inclusief btw, voor het eerst op ` +
    `${formatDocumentDate(activates.firstDebitOn)}. Dat maandbedrag maakt geen deel uit van het totaal van deze factuur ` +
    `en wordt apart in rekening gebracht; u ontvangt daarvoor elke maand een eigen factuur.`
  );
}

function Activation({ activates }: { activates: InvoiceActivation }) {
  return (
    <View style={{ marginTop: 14 }} wrap={false}>
      <Text style={[styles.mono, { marginBottom: 5 }]}>Maandelijkse dienst</Text>
      <Text style={[styles.prose, { maxWidth: "88%" }]}>{activationNote(activates)}</Text>
    </View>
  );
}

/** A monthly term of a recurring service, rather than a one-off invoice. */
export function isRecurringTerm(invoice: Invoice): boolean {
  return Boolean(invoice.recurringServiceId && invoice.billingPeriodStart && invoice.billingPeriodEnd);
}

/**
 * The rows at the top of the document. Exported because what a monthly term
 * has to show -- the period, and a collection date instead of a due date --
 * is a decision worth testing on its own; the rendered bytes are compressed
 * and prove nothing about wording.
 */
export function invoiceMetaRows(invoice: Invoice): { label: string; value: string }[] {
  const recurring = isRecurringTerm(invoice);
  const settled = recurring && invoice.status === "paid";

  return [
    { label: "Factuurdatum", value: formatDocumentDate(invoice.issueDate) },
    /*
      A collection that is coming gets its date. A term that is already paid
      gets neither a due date nor a collection date: there is nothing left to
      happen, and printing one would promise a second debit.
    */
    ...(settled
      ? []
      : [
          recurring
            ? { label: "Incassodatum", value: formatDocumentDate(invoice.dueDate) }
            : { label: "Vervaldatum", value: formatDocumentDate(invoice.dueDate) },
        ]),
    ...(recurring
      ? [
          {
            label: "Periode",
            value: `${formatDocumentDate(invoice.billingPeriodStart!)} t/m ${formatDocumentDate(invoice.billingPeriodEnd!)}`,
          },
        ]
      : []),
    { label: "Betalingskenmerk", value: paymentReferenceOf(invoice) },
  ];
}

export default function InvoicePdf({ invoice, activates }: { invoice: Invoice; activates?: InvoiceActivation }) {
  const recurring = isRecurringTerm(invoice);

  return (
    <DocumentLayout
      kind="FACTUUR"
      title={`Factuur ${invoice.number.value}`}
      number={invoice.number.value}
      provisional={invoice.number.provisional}
      meta={invoiceMetaRows(invoice)}
      customer={invoice.customer}
      lines={invoice.lines}
      notes={invoice.notes || undefined}
      afterTotals={
        recurring ? (
          invoice.status === "paid" ? <Settled invoice={invoice} /> : <DirectDebit invoice={invoice} />
        ) : (
          <>
            <Payment invoice={invoice} />
            {activates ? <Activation activates={activates} /> : null}
          </>
        )
      }
    />
  );
}
