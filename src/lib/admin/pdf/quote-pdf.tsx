import DocumentLayout, { formatDocumentDate } from "@/lib/admin/pdf/document-layout";
import type { Quote } from "@/lib/admin/quotes/types";

export default function QuotePdf({ quote }: { quote: Quote }) {
  return (
    <DocumentLayout
      kind="OFFERTE"
      title={`Offerte ${quote.number.value}`}
      number={quote.number.value}
      provisional={quote.number.provisional}
      meta={[
        { label: "Offertedatum", value: formatDocumentDate(quote.issueDate) },
        { label: "Geldig tot", value: formatDocumentDate(quote.validUntil) },
        { label: "Contactpersoon", value: quote.customer.contactName },
      ]}
      customer={quote.customer}
      subject={quote.subject}
      intro={quote.intro || undefined}
      lines={quote.lines}
      notes={quote.notes || undefined}
    />
  );
}
