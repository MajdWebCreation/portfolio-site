import { Text, View } from "@react-pdf/renderer";
import { companyProfile } from "@/lib/admin/documents/company";
import type { Invoice } from "@/lib/admin/invoices/types";
import DocumentLayout, { formatDocumentDate } from "@/lib/admin/pdf/document-layout";
import { styles } from "@/lib/admin/pdf/theme";

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
 * Payment block: the request in a sentence, the bank details as rows, so the
 * IBAN and the account holder read as data rather than running text. The BIC
 * row is omitted while no BIC is configured.
 */
function Payment({ invoice }: { invoice: Invoice }) {
  return (
    <View style={{ marginTop: 18 }} wrap={false}>
      <Text style={[styles.mono, { marginBottom: 5 }]}>Betaling</Text>
      <Text style={[styles.prose, { maxWidth: "88%" }]}>
        Graag betalen vóór {formatDocumentDate(invoice.dueDate)} onder vermelding van {invoice.paymentReference || invoice.number.value}.
      </Text>
      <View style={{ width: "56%", marginTop: 8 }}>
        <DetailRow label="IBAN" value={companyProfile.iban} />
        {companyProfile.bic ? <DetailRow label="BIC" value={companyProfile.bic} /> : null}
        <DetailRow label="T.n.v." value={companyProfile.accountHolder} />
      </View>
    </View>
  );
}

export default function InvoicePdf({ invoice }: { invoice: Invoice }) {
  return (
    <DocumentLayout
      kind="FACTUUR"
      title={`Factuur ${invoice.number.value}`}
      number={invoice.number.value}
      provisional={invoice.number.provisional}
      meta={[
        { label: "Factuurdatum", value: formatDocumentDate(invoice.issueDate) },
        { label: "Vervaldatum", value: formatDocumentDate(invoice.dueDate) },
        { label: "Betalingskenmerk", value: invoice.paymentReference || invoice.number.value },
      ]}
      customer={invoice.customer}
      lines={invoice.lines}
      notes={invoice.notes || undefined}
      afterTotals={<Payment invoice={invoice} />}
    />
  );
}
