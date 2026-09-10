import {
  termsDocument,
  type TermsClause,
  type TermsNote,
  type TermsTable,
} from "@/lib/content/terms";

const articleAnchor = (number: number) => `artikel-${number}`;
const appendixAAnchor = "bijlage-a";

/** Table of contents, the same list the document itself opens with. */
function TermsContents({ className = "" }: { className?: string }) {
  const doc = termsDocument;
  const items = [
    ...doc.articles.map((article) => ({
      href: `#${articleAnchor(article.number)}`,
      number: `${article.number}.`,
      label: article.title,
    })),
    {
      href: `#${appendixAAnchor}`,
      number: "A.",
      label: doc.appendixA.title.split(" - ")[0],
    },
  ];

  return (
    <ol className={`space-y-1.5 text-[0.9rem] leading-snug ${className}`}>
      {items.map((item) => (
        <li key={item.href}>
          <a
            href={item.href}
            className="grid grid-cols-[2rem_1fr] gap-x-2 py-0.5 text-muted transition-colors hover:text-ink"
          >
            <span className="tabular">{item.number}</span>
            <span>{item.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

function Note({
  note,
  emphasis = false,
  headingLevel: Heading = "h2",
}: {
  note: TermsNote;
  emphasis?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <div className={emphasis ? "border-l-2 border-accent pl-5" : ""}>
      <Heading className="label-mono">{note.heading}</Heading>
      <p className="mt-2 text-[1rem] leading-relaxed text-body">{note.text}</p>
    </div>
  );
}

function ClauseList({ clauses }: { clauses: TermsClause[] }) {
  return (
    <ol className="mt-5 space-y-3.5">
      {clauses.map((clause) => (
        <li
          key={clause.number}
          className="grid grid-cols-[3.4rem_1fr] gap-x-2 text-[1rem] leading-relaxed text-body"
        >
          <span className="tabular text-muted">{clause.number}.</span>
          <span>{clause.text}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Data table that stacks into label/value rows on small screens. The roles
 * are explicit because the stacked layout changes the CSS display values.
 */
function DataTable({ table, id }: { table: TermsTable; id: string }) {
  return (
    <div className="mt-8">
      {table.caption ? (
        <h3 id={id} className="text-[1.05rem] font-semibold text-ink">
          {table.caption}
        </h3>
      ) : null}
      <table
        role="table"
        aria-labelledby={table.caption ? id : undefined}
        className="tm-table mt-3"
      >
        <thead role="rowgroup">
          <tr role="row">
            {table.columns.map((column) => (
              <th key={column} role="columnheader" scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {table.rows.map((row) => (
            <tr key={row[0]} role="row">
              {row.map((cell, index) => (
                <td key={table.columns[index]} role="cell" data-label={table.columns[index]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.note ? (
        <p className="mt-3 text-[0.9rem] leading-relaxed text-muted">{table.note}</p>
      ) : null}
    </div>
  );
}

/**
 * The full text of the terms in document order: colophon and contents,
 * the articles and the appendix, closing with the document's end line.
 */
export default function TermsDocument() {
  const doc = termsDocument;
  const colophonParts = doc.colophon.split(" - ");

  return (
    <div className="container-x pt-10 lg:pt-14">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
        {/* Colophon and contents: collapsible on small screens, sticky column on large. */}
        <aside className="lg:col-span-3">
          <ul className="label-mono space-y-1.5">
            {colophonParts.map((part) => (
              <li key={part} className="normal-case tracking-normal">
                {part}
              </li>
            ))}
          </ul>
          <details className="group mt-8 border-y border-line py-4 lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[1rem] font-medium text-ink [&::-webkit-details-marker]:hidden">
              {doc.contentsHeading}
              <span aria-hidden="true" className="text-faint transition-transform group-open:rotate-90">
                →
              </span>
            </summary>
            <TermsContents className="mt-4" />
          </details>
          <nav
            aria-label={doc.contentsHeading}
            className="hidden lg:sticky lg:top-24 lg:mt-8 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:border-t lg:border-line lg:pt-6"
          >
            <p className="label-mono">{doc.contentsHeading}</p>
            <TermsContents className="mt-4" />
          </nav>
        </aside>

        <div className="lg:col-span-8 lg:col-start-5">
          <Note note={doc.importantNote} emphasis />

          {doc.articles.map((article) => (
            <section
              key={article.number}
              id={articleAnchor(article.number)}
              aria-labelledby={`${articleAnchor(article.number)}-title`}
              className="mt-12 border-t border-line pt-7"
            >
              <h2
                id={`${articleAnchor(article.number)}-title`}
                className="text-[1.3rem] font-semibold leading-snug text-ink"
              >
                <span className="label-mono mb-1.5 block">Artikel {article.number}</span>
                {article.title}
              </h2>
              <ClauseList clauses={article.clauses} />
            </section>
          ))}

          <section
            id={appendixAAnchor}
            aria-labelledby={`${appendixAAnchor}-title`}
            className="mt-16 border-t-2 border-ink pt-7"
          >
            <h2
              id={`${appendixAAnchor}-title`}
              className="text-[1.3rem] font-semibold leading-snug text-ink"
            >
              <span className="label-mono mb-1.5 block">{doc.appendixA.label}</span>
              {doc.appendixA.title}
            </h2>
            <div className="mt-6">
              <Note note={doc.appendixA.relation} headingLevel="h3" />
            </div>
            <DataTable table={doc.appendixA.classes} id={`${appendixAAnchor}-1`} />
            <DataTable table={doc.appendixA.included} id={`${appendixAAnchor}-2`} />
            <DataTable table={doc.appendixA.backups} id={`${appendixAAnchor}-3`} />
            <div className="mt-8">
              <h3 className="text-[1.05rem] font-semibold text-ink">{doc.appendixA.exit.heading}</h3>
              <ClauseList clauses={doc.appendixA.exit.clauses} />
            </div>
          </section>

          <p className="label-mono mt-16 border-t border-line pt-6 normal-case tracking-normal">
            {doc.endLine}
          </p>
        </div>
      </div>
    </div>
  );
}
