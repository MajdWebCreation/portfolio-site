import { Text, View } from "@react-pdf/renderer";
import type { CreditNote } from "@/lib/admin/credit-notes/types";
import DocumentLayout, { formatDocumentDate, type TotalsLabels } from "@/lib/admin/pdf/document-layout";
import { styles } from "@/lib/admin/pdf/theme";
import { formatCents } from "@/lib/money";

/**
 * The credit note as a document: the same sheet as an invoice, with the
 * one difference that matters printed everywhere it can be -- the header
 * says CREDITNOTA, the metadata names the invoice it corrects, the totals
 * are labelled as credited, and the block under them says what happens to
 * the money. The lines carry positive figures; the document as a whole is
 * the correction, and that is said in words rather than with minus signs
 * the reader would have to add up.
 */
export const creditNoteTotalsLabels: TotalsLabels = {
  subtotal: "Gecrediteerd excl. btw",
  total: "Totaal gecrediteerd incl. btw",
};

export function creditNoteMetaRows(creditNote: CreditNote, invoiceNumber: string): { label: string; value: string }[] {
  return [
    { label: "Creditnotadatum", value: formatDocumentDate(creditNote.issueDate) },
    { label: "Betreft factuur", value: invoiceNumber },
    { label: "Kenmerk", value: creditNote.number.value },
  ];
}

/** The one sentence that makes the direction of the money unmistakable. */
export function creditNoteSettlementNote(creditNote: CreditNote, invoiceNumber: string): string {
  return (
    `Deze creditnota corrigeert factuur ${invoiceNumber} met ${formatCents(creditNote.totalCents)} inclusief btw. ` +
    `Is die factuur al betaald, dan betalen wij dit bedrag aan u terug; is zij nog open, dan wordt het erop in mindering gebracht. ` +
    `U hoeft zelf niets te doen.`
  );
}

function Settlement({ creditNote, invoiceNumber }: { creditNote: CreditNote; invoiceNumber: string }) {
  return (
    <View style={{ marginTop: 18 }} wrap={false}>
      <Text style={[styles.mono, { marginBottom: 5 }]}>Verrekening</Text>
      <Text style={[styles.prose, { maxWidth: "88%" }]}>{creditNoteSettlementNote(creditNote, invoiceNumber)}</Text>
    </View>
  );
}

export default function CreditNotePdf({ creditNote, invoiceNumber }: { creditNote: CreditNote; invoiceNumber: string }) {
  return (
    <DocumentLayout
      kind="CREDITNOTA"
      title={`Creditnota ${creditNote.number.value}`}
      number={creditNote.number.value}
      provisional={creditNote.number.provisional}
      meta={creditNoteMetaRows(creditNote, invoiceNumber)}
      customer={creditNote.customer}
      intro={`Reden: ${creditNote.reason}`}
      lines={creditNote.lines}
      totalsLabels={creditNoteTotalsLabels}
      afterTotals={<Settlement creditNote={creditNote} invoiceNumber={invoiceNumber} />}
    />
  );
}
