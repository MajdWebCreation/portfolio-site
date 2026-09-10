import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { companyProfile } from "@/lib/admin/documents/company";
import type { CustomerSnapshot, DocumentLine } from "@/lib/admin/documents/types";
import { formatDate } from "@/lib/admin/format";
import Logo from "@/lib/admin/pdf/logo";
import { colors, footer, page, styles } from "@/lib/admin/pdf/theme";
import { calculateTotals, formatCents, formatQuantity, lineNetCents } from "@/lib/money";

/**
 * Shared A4 layout for quotes and invoices: header with the mark and the
 * document type, addresses, metadata, line table, VAT summary and totals,
 * notes, and a footer with the company details and page numbers. The
 * specific documents pass their own labels and extra blocks.
 */
export type MetaItem = { label: string; value: string };

type DocumentLayoutProps = {
  kind: "OFFERTE" | "FACTUUR";
  title: string;
  number: string;
  provisional: boolean;
  meta: MetaItem[];
  customer: CustomerSnapshot;
  subject?: string;
  intro?: string;
  lines: DocumentLine[];
  notes?: string;
  /** Block under the totals, e.g. payment details on an invoice. */
  afterTotals?: ReactNode;
};

const columns = { description: "50%", quantity: "10%", price: "15%", vat: "8%", amount: "17%" } as const;

function Address({ customer }: { customer: CustomerSnapshot }) {
  return (
    <View style={styles.address}>
      <Text style={styles.bold}>{customer.companyName}</Text>
      <Text>{customer.contactName}</Text>
      <Text>{customer.street}</Text>
      <Text>
        {customer.postalCode} {customer.city}
      </Text>
      {customer.country !== "Nederland" ? <Text>{customer.country}</Text> : null}
      {customer.kvkNumber ? <Text style={styles.muted}>KvK {customer.kvkNumber}</Text> : null}
      {customer.vatNumber ? <Text style={styles.muted}>Btw-id {customer.vatNumber}</Text> : null}
    </View>
  );
}

/**
 * The company details, in three columns: who and where, how to reach us, and
 * the identifiers. Same eight facts as before, three lines tall instead of
 * eight, which is what keeps the footer inside its reserved strip.
 */
function Company() {
  const { address } = companyProfile;
  return (
    <View style={[styles.row, styles.footerText]}>
      <View style={{ width: "38%", paddingRight: 10 }}>
        <Text style={styles.bold}>{companyProfile.legalName}</Text>
        <Text>{address.street}</Text>
        <Text>
          {address.postalCode} {address.city}
          {address.country !== "Nederland" ? `, ${address.country}` : ""}
        </Text>
      </View>
      <View style={{ width: "34%", paddingRight: 10 }}>
        <Text>{companyProfile.email}</Text>
        <Text>{companyProfile.phone}</Text>
        <Text>{companyProfile.website}</Text>
      </View>
      <View style={{ width: "28%" }}>
        <Text style={styles.muted}>KvK {companyProfile.kvk}</Text>
        <Text style={styles.muted}>Btw-id {companyProfile.vatNumber}</Text>
      </View>
    </View>
  );
}

function LineRow({ line }: { line: DocumentLine }) {
  return (
    <View style={[styles.row, styles.hairline, { paddingVertical: 6 }]} wrap={false}>
      <Text style={[styles.cellText, styles.ink, { width: columns.description }]}>{line.description}</Text>
      <Text style={[styles.right, { width: columns.quantity }]}>{formatQuantity(line.quantityHundredths)}</Text>
      <Text style={[styles.right, { width: columns.price }]}>{formatCents(line.unitPriceCents)}</Text>
      <Text style={[styles.right, { width: columns.vat }]}>{line.vatRate}%</Text>
      <Text style={[styles.right, styles.ink, { width: columns.amount }]}>{formatCents(lineNetCents(line))}</Text>
    </View>
  );
}

function TotalsBlock({ lines }: { lines: DocumentLine[] }) {
  const totals = calculateTotals(lines);
  const row = (label: string, value: string, strong = false) => (
    <View key={label} style={[styles.row, strong ? { borderTopWidth: 1.2, borderTopColor: colors.ink, paddingTop: 7, marginTop: 3 } : styles.hairline, { paddingVertical: 4, justifyContent: "space-between" }]}>
      <Text style={strong ? [styles.bold, { fontSize: 11.5 }] : styles.muted}>{label}</Text>
      <Text style={strong ? [styles.bold, { fontSize: 11.5 }] : styles.ink}>{value}</Text>
    </View>
  );
  return (
    <View style={{ alignSelf: "flex-end", width: "46%", marginTop: 10 }}>
      {row("Subtotaal excl. btw", formatCents(totals.subtotalCents))}
      {totals.vatGroups.map((group) => row(`Btw ${group.rate}% over ${formatCents(group.netCents)}`, formatCents(group.vatCents)))}
      {row("Totaal incl. btw", formatCents(totals.totalCents), true)}
    </View>
  );
}

/**
 * The line table with the totals. The header repeats on every page; the
 * last line and the totals stay together, so the totals never appear on a
 * page without at least one line above them.
 */
function LineTable({ lines }: { lines: DocumentLine[] }) {
  const head = lines.slice(0, -1);
  const last = lines[lines.length - 1];
  return (
    <View style={{ marginTop: 20 }}>
      <View style={[styles.row, styles.hairlineStrong, { paddingBottom: 8 }]} fixed>
        <Text style={[styles.monoHead, { width: columns.description }]}>Omschrijving</Text>
        <Text style={[styles.monoHead, styles.right, { width: columns.quantity }]}>Aantal</Text>
        <Text style={[styles.monoHead, styles.right, { width: columns.price }]}>Prijs excl.</Text>
        <Text style={[styles.monoHead, styles.right, { width: columns.vat }]}>Btw</Text>
        <Text style={[styles.monoHead, styles.right, { width: columns.amount }]}>Bedrag excl.</Text>
      </View>
      {head.map((line) => (
        <LineRow key={line.id} line={line} />
      ))}
      <View wrap={false}>
        {last ? <LineRow line={last} /> : null}
        <TotalsBlock lines={lines} />
      </View>
    </View>
  );
}

export default function DocumentLayout({ kind, title, number, provisional, meta, customer, subject, intro, lines, notes, afterTotals }: DocumentLayoutProps) {
  return (
    <Document title={title} author={companyProfile.name} language="nl">
      <Page size="A4" style={styles.page}>
        <View style={[styles.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
          <Logo />
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.bold, { fontSize: 20, letterSpacing: 2, lineHeight: 1.15 }]}>{kind}</Text>
            <Text style={[styles.ink, { fontSize: 10.5, marginTop: 6, lineHeight: 1.2 }]}>{number}</Text>
            {provisional ? <Text style={[styles.mono, { marginTop: 5, color: colors.accent }]}>Conceptnummer</Text> : null}
          </View>
        </View>

        <View style={[styles.row, { marginTop: 28, justifyContent: "space-between" }]}>
          <View style={{ width: "48%" }}>
            <Text style={[styles.mono, { marginBottom: 5 }]}>Aan</Text>
            <Address customer={customer} />
          </View>
          <View style={{ width: "40%" }}>
            {meta.map((item) => (
              <View key={item.label} style={[styles.row, styles.hairline, { paddingVertical: 3.5 }]}>
                <Text style={[styles.muted, { flexShrink: 0, marginRight: 10 }]}>{item.label}</Text>
                <Text style={[styles.ink, styles.right, { flex: 1 }]}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {subject ? <Text style={[styles.bold, { fontSize: 13, marginTop: 26 }]}>{subject}</Text> : null}
        {intro ? <Text style={[styles.prose, { marginTop: subject ? 6 : 26, maxWidth: "88%" }]}>{intro}</Text> : null}

        <LineTable lines={lines} />

        {afterTotals}

        {/* Notes stay together: the label never ends a page with its text on the next. */}
        {notes ? (
          <View style={{ marginTop: 18, maxWidth: "88%" }} wrap={false}>
            <Text style={[styles.mono, { marginBottom: 4 }]}>Opmerkingen</Text>
            <Text style={styles.prose}>{notes}</Text>
          </View>
        ) : null}

        {/*
          The footer sits at the same offset on every page and is exactly as
          tall as the strip `page.marginBottom` reserves for it, so content
          can never run underneath it.
        */}
        <View
          fixed
          style={[
            styles.row,
            {
              position: "absolute",
              left: page.marginX,
              right: page.marginX,
              bottom: footer.bottom,
              height: footer.height,
              justifyContent: "space-between",
              alignItems: "flex-start",
              borderTopWidth: 0.6,
              borderTopColor: colors.line,
              paddingTop: 7,
            },
          ]}
        >
          <View style={{ width: "82%" }}>
            <Company />
          </View>
          {/* No text-transform here: react-pdf drops render-prop text when it is transformed. */}
          <Text
            style={{ fontFamily: "Courier", fontSize: 7.5, color: colors.faint }}
            render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} van ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export function formatDocumentDate(dateKey: string) {
  return formatDate(`${dateKey}T12:00:00+02:00`);
}
