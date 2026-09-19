import AdminSection from "@/components/admin/admin-section";
import SendPanel from "@/components/admin/documents/send-panel";
import InvoiceDocument from "@/components/admin/invoices/invoice-document";
import InvoiceFinalize from "@/components/admin/invoices/invoice-finalize";
import DocumentTotalsView from "@/components/admin/documents/document-totals";
import StatusBadge from "@/components/admin/status-badge";
import InvoiceWithdraw from "@/components/admin/invoices/invoice-withdraw";
import { invoiceDocument } from "@/lib/admin/documents/document-payload";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { invoiceStatusLabels, invoiceStatusTone, type Invoice } from "@/lib/admin/invoices/types";
import { calculateTotals, formatCents, formatQuantity, lineNetCents } from "@/lib/money";

/**
 * An invoice that is no longer a concept.
 *
 * Read-only, and not the builder with its fields switched off: there is
 * nothing here to change. The figures, the snapshot, the dates, the number
 * and the payment reference were frozen when the document was issued, and the
 * database refuses to move any of them -- so a screen full of inputs would
 * only be inviting an error message.
 *
 * What it is for is the one question the admin has at this point: is this the
 * document I want the customer to have? Hence the numbers first, then the
 * lines as they are printed, then the PDF, then sending.
 */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-line py-2">
      <dt className="text-[0.8rem] uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[0.95rem] text-ink">{value}</dd>
    </div>
  );
}

export default function InvoiceIssued({ invoice }: { invoice: Invoice }) {
  const document = invoiceDocument(invoice);
  const totals = calculateTotals(invoice.lines);
  const day = (dateKey: string) => formatDate(`${dateKey}T12:00:00+02:00`);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="space-y-10">
        <AdminSection
          id="document"
          title="Factuur"
          note={invoice.sentAt ? "Verstuurd; de gegevens liggen vast" : "Definitief; de gegevens liggen vast"}
        >
          <p className="text-[0.9rem] leading-snug text-body">
            {!invoice.issuedAt
              ? "Het definitief maken van deze factuur is niet afgerond. Het nummer is toegekend en de gegevens liggen vast; de PDF moet nog worden opgeslagen."
              : invoice.sentAt
                ? "Deze factuur is verstuurd. De PDF hiernaast is exact het bestand dat de klant heeft ontvangen."
                : "Deze factuur is definitief. Controleer de PDF voordat je hem verstuurt; exact dat bestand gaat naar de klant."}
          </p>
          <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">
            <Fact label="Factuurnummer" value={invoice.number.value} />
            <Fact label="Betalingskenmerk" value={invoice.paymentReference || invoice.number.value} />
            <Fact label="Factuurdatum" value={day(invoice.issueDate)} />
            <Fact label="Vervaldatum" value={day(invoice.dueDate)} />
            <Fact label="Klant" value={invoice.customer.companyName} />
            <Fact
              label="Adres"
              value={`${invoice.customer.street}, ${invoice.customer.postalCode} ${invoice.customer.city}`}
            />
            {invoice.issuedAt ? <Fact label="Definitief gemaakt" value={formatDateTime(invoice.issuedAt)} /> : null}
            {invoice.document ? <Fact label="PDF" value={`${(invoice.document.bytes / 1024).toFixed(0)} kB`} /> : null}
            {invoice.sentAt ? (
              <Fact
                label="Verstuurd"
                value={`${formatDateTime(invoice.sentAt)}${invoice.recipientEmail ? ` naar ${invoice.recipientEmail}` : ""}`}
              />
            ) : null}
          </dl>
        </AdminSection>

        <AdminSection id="lines-heading" title="Regels">
          <table className="w-full text-[0.92rem]">
            <thead>
              <tr className="border-b border-line text-left text-[0.8rem] uppercase tracking-[0.08em] text-muted">
                <th scope="col" className="py-2 font-normal">
                  Omschrijving
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Aantal
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Stukprijs
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Btw
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Bedrag
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id} className="border-b border-line align-top">
                  <td className="py-2 pr-4 text-ink">{line.description}</td>
                  <td className="tabular py-2 text-right text-body">{formatQuantity(line.quantityHundredths)}</td>
                  <td className="tabular py-2 text-right text-body">{formatCents(line.unitPriceCents)}</td>
                  <td className="tabular py-2 text-right text-body">{line.vatRate}%</td>
                  <td className="tabular py-2 text-right text-ink">
                    {formatCents(lineNetCents(line))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6">
            <DocumentTotalsView totals={totals} />
          </div>
        </AdminSection>

        {document.activates ? (
          <AdminSection id="recurring" title="Maandelijkse service" note="Staat zo op de factuur">
            <p className="text-[0.9rem] leading-snug text-body">
              Door deze factuur te betalen machtigt de klant ons om {document.activates.serviceName} maandelijks te
              incasseren: {formatCents(document.activates.monthlyGrossCents)} incl. btw, voor het eerst op{" "}
              {day(document.activates.firstDebitOn)}. Dat bedrag staat niet in het totaal van deze factuur.
            </p>
          </AdminSection>
        ) : null}

        {invoice.notes ? (
          <AdminSection id="notes" title="Opmerkingen">
            <p className="whitespace-pre-line text-[0.9rem] leading-relaxed text-body">{invoice.notes}</p>
          </AdminSection>
        ) : null}
      </div>

      <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8">
        <div className="space-y-3">
          {invoice.issuedAt ? (
            <StatusBadge tone={invoiceStatusTone[invoice.status]}>{invoiceStatusLabels[invoice.status]}</StatusBadge>
          ) : (
            <StatusBadge tone="danger">Niet afgerond</StatusBadge>
          )}
          <p className="font-mono text-[1.05rem] text-ink">{invoice.number.value}</p>
          <p className="text-[0.85rem] leading-snug text-muted">
            Betalingskenmerk <span className="font-mono text-ink">{invoice.paymentReference || invoice.number.value}</span>
          </p>
        </div>
        <section aria-labelledby="pdf-heading" className="space-y-4 border-t border-line pt-6">
          <h2 id="pdf-heading" className="label-mono text-ink">
            PDF
          </h2>
          {invoice.document ? (
            <InvoiceDocument invoiceId={invoice.id} document={invoice.document} />
          ) : (
            <>
              <p className="text-[0.85rem] leading-snug text-danger">
                Het definitief maken is niet afgerond: er is geen opgeslagen PDF. Rond het hieronder af; het nummer{" "}
                {invoice.number.value} blijft van deze factuur en verandert niet.
              </p>
              <InvoiceFinalize invoice={invoice} ready />
            </>
          )}
          {invoice.document ? <SendPanel doc={{ kind: "invoice", ...document }} /> : null}
        </section>
        {invoice.sentAt || invoice.status === "cancelled" ? null : (
          <InvoiceWithdraw invoiceId={invoice.id} number={invoice.number.value} />
        )}
      </aside>
    </div>
  );
}
