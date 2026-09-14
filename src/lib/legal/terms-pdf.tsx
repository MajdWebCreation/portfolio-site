import { Document, Font, Page, Text, View } from "@react-pdf/renderer";
import { companyProfile } from "@/lib/admin/documents/company";
import Logo from "@/lib/admin/pdf/logo";
import { colors, footer, page, styles } from "@/lib/admin/pdf/theme";
import {
  termsDocument,
  type TermsClause,
  type TermsNote,
  type TermsTable,
} from "@/lib/content/terms";

/**
 * The general terms as a PDF, rendered from `lib/content/terms.ts`.
 *
 * The same data the web page reads, so the two can never say different
 * things: correcting a clause is one edit, and rebuilding the PDF is one
 * command. Before this, the PDF was the original and the page a transcript of
 * it -- which meant nobody could prove the two still matched.
 *
 * Same theme as the quote and invoice documents, so a customer who has all
 * three recognises them as one set of paperwork.
 */
const doc = termsDocument;

/*
  No hyphenation. react-pdf breaks long words across lines by default, which
  puts a hyphen inside a word in the text layer -- so a clause copied out of
  the PDF comes back with "ontvan- gen" in it, and the PDF no longer literally
  contains what the page shows. A legal document has to be quotable.
*/
Font.registerHyphenationCallback((word) => [word]);

const gutter = 34;

function Clauses({ clauses }: { clauses: TermsClause[] }) {
  return (
    <View style={{ marginTop: 8 }}>
      {clauses.map((clause) => (
        <View key={clause.number} style={[styles.row, { marginTop: 5 }]} wrap={false}>
          <Text style={[styles.muted, { width: gutter }]}>{clause.number}</Text>
          <Text style={[styles.prose, { flex: 1 }]}>{clause.text}</Text>
        </View>
      ))}
    </View>
  );
}

function Note({ note, emphasis = false }: { note: TermsNote; emphasis?: boolean }) {
  return (
    <View
      style={
        emphasis
          ? { borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: 10, marginTop: 4 }
          : { marginTop: 4 }
      }
      wrap={false}
    >
      <Text style={styles.mono}>{note.heading}</Text>
      <Text style={[styles.prose, { marginTop: 4 }]}>{note.text}</Text>
    </View>
  );
}

/**
 * A table with even columns. The widths are shared out rather than tuned per
 * table: these are reference tables, and a column that happens to be narrow
 * wraps instead of being cut off.
 */
function DataTable({ table }: { table: TermsTable }) {
  const width = `${(100 / table.columns.length).toFixed(4)}%`;
  return (
    <View style={{ marginTop: 14 }}>
      {table.caption ? <Text style={[styles.bold, { fontSize: 10.5 }]}>{table.caption}</Text> : null}
      <View style={[styles.row, styles.hairlineStrong, { marginTop: 7, paddingBottom: 4 }]}>
        {table.columns.map((column) => (
          <Text key={column} style={[styles.monoHead, styles.cellText, { width }]}>
            {column}
          </Text>
        ))}
      </View>
      {table.rows.map((row) => (
        <View key={row.join("|")} style={[styles.row, styles.hairline, { paddingVertical: 5 }]} wrap={false}>
          {row.map((cell, index) => (
            <Text
              key={`${index}-${cell}`}
              style={[styles.cellText, index === 0 ? styles.ink : undefined, { width, fontSize: 8.5, lineHeight: 1.35 }]}
            >
              {cell}
            </Text>
          ))}
        </View>
      ))}
      {table.note ? <Text style={[styles.small, styles.muted, { marginTop: 6 }]}>{table.note}</Text> : null}
    </View>
  );
}

function Company() {
  const { address } = companyProfile;
  return (
    <View style={[styles.row, styles.footerText]}>
      <View style={{ width: "38%", paddingRight: 10 }}>
        <Text style={styles.bold}>{companyProfile.legalName}</Text>
        <Text>{address.street}</Text>
        <Text>
          {address.postalCode} {address.city}
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

export default function TermsPdf() {
  return (
    <Document
      title={doc.documentTitle}
      author={companyProfile.legalName}
      subject={doc.subtitle}
      language="nl"
    >
      <Page size="A4" style={styles.page}>
        {/* Title block: only on the first page, so the document opens as one. */}
        <View style={[styles.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
          <View style={{ flex: 1, paddingRight: 20 }}>
            <Text style={styles.mono}>Algemene Voorwaarden {doc.audience}</Text>
            <Text style={[styles.bold, { fontSize: 19, marginTop: 8 }]}>{doc.documentTitle}</Text>
            <Text style={[styles.prose, styles.muted, { marginTop: 8 }]}>{doc.subtitle}</Text>
          </View>
          <Logo />
        </View>

        <View style={[styles.row, styles.hairlineStrong, { marginTop: 16, paddingBottom: 8 }]}>
          <View style={{ width: "50%" }}>
            <Text style={styles.mono}>Editie</Text>
            <Text style={[styles.ink, { marginTop: 3 }]}>{doc.edition}</Text>
          </View>
          <View style={{ width: "50%" }}>
            <Text style={styles.mono}>Gepubliceerd</Text>
            <Text style={[styles.ink, { marginTop: 3 }]}>{doc.dateLabel}</Text>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <Note note={doc.importantNote} emphasis />
        </View>

        {/* Contents, so the printed document is navigable like the page. */}
        <View style={{ marginTop: 20 }} wrap={false}>
          <Text style={styles.mono}>{doc.contentsHeading}</Text>
          <View style={[styles.row, { marginTop: 8, flexWrap: "wrap" }]}>
            {doc.articles.map((article) => (
              <View key={article.number} style={[styles.row, { width: "50%", paddingRight: 14, marginTop: 3 }]}>
                <Text style={[styles.muted, { width: 20 }]}>{article.number}</Text>
                <Text style={[styles.small, { flex: 1 }]}>{article.title}</Text>
              </View>
            ))}
            <View style={[styles.row, { width: "50%", paddingRight: 14, marginTop: 3 }]}>
              <Text style={[styles.muted, { width: 20 }]}>A</Text>
              <Text style={[styles.small, { flex: 1 }]}>{doc.appendixA.title.split(" - ")[0]}</Text>
            </View>
          </View>
        </View>

        {doc.articles.map((article) => (
          <View key={article.number} style={{ marginTop: 18 }} break={article.number === 1 ? true : undefined}>
            <View style={styles.hairline} wrap={false}>
              <Text style={styles.mono}>Artikel {article.number}</Text>
              <Text style={[styles.bold, { fontSize: 12, marginTop: 3, marginBottom: 6 }]}>{article.title}</Text>
            </View>
            <Clauses clauses={article.clauses} />
          </View>
        ))}

        <View style={{ marginTop: 26 }} break>
          <View style={{ borderBottomWidth: 1.2, borderBottomColor: colors.ink, paddingBottom: 6 }} wrap={false}>
            <Text style={styles.mono}>{doc.appendixA.label}</Text>
            <Text style={[styles.bold, { fontSize: 13, marginTop: 3 }]}>{doc.appendixA.title}</Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <Note note={doc.appendixA.relation} />
          </View>
          <DataTable table={doc.appendixA.classes} />
          <DataTable table={doc.appendixA.included} />
          <DataTable table={doc.appendixA.backups} />
          <View style={{ marginTop: 18 }}>
            <Text style={[styles.bold, { fontSize: 10.5 }]}>{doc.appendixA.exit.heading}</Text>
            <Clauses clauses={doc.appendixA.exit.clauses} />
          </View>
        </View>

        <Text style={[styles.mono, { marginTop: 26, paddingTop: 8, borderTopWidth: 0.6, borderTopColor: colors.line }]}>
          {doc.endLine}
        </Text>

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
            style={[styles.footerText, styles.muted, styles.right, { width: "18%" }]}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
