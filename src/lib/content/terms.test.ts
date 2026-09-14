import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { termsDocument } from "@/lib/content/terms";

/*
  The terms, as a document rather than as prose.

  Nothing here judges the wording -- that is a lawyer's job. What it does
  check is the things that silently rot: a clause number that skips, a
  cross-reference to an article that no longer says what it used to, a PDF
  that is not the file the page links to, and a version number creeping back
  in after we decided the edition is the year.
*/
const doc = termsDocument;
const allClauses = [
  ...doc.articles.flatMap((article) => article.clauses.map((clause) => ({ article: article.number, ...clause }))),
];

describe("how the edition is named", () => {
  /* Outward it is the year. A customer signs "2026", never "v1.1". */
  it("names the edition by year and nothing else", () => {
    expect(doc.edition).toMatch(/^\d{4}$/);
    expect(doc.documentTitle).toBe(`YM Creations — Algemene Voorwaarden B2B — ${doc.edition}`);
    expect(doc.shortLabel).toBe(`Voorwaarden ${doc.edition}`);
    expect(doc.versionLine).toBe(`Algemene Voorwaarden B2B — ${doc.edition}`);
  });

  /* The publication date stays, for the administration; it is not a name. */
  it("keeps an internal publication date in the edition's own year", () => {
    expect(doc.dateIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc.dateIso.startsWith(doc.edition)).toBe(true);
    expect(doc.dateLabel).toContain(doc.edition);
  });

  /*
    Checked on the strings that name the document, not on the clauses: a
    clause may of course say "artikel 9.12", and that is a reference, not a
    version.
  */
  it("carries no version number in anything that names the document", () => {
    const names = [
      doc.documentTitle,
      doc.versionLine,
      doc.shortLabel,
      doc.endLine,
      doc.colophon,
      doc.pdf.path,
      doc.pdf.fileName,
    ];

    for (const name of names) {
      expect(name, name).not.toMatch(/\bv?\d+\.\d+\b/);
      expect(name.toLowerCase(), name).not.toContain("versie");
    }
  });

  it("closes with the edition, not with a version", () => {
    expect(doc.endLine).toContain(doc.edition);
    expect(doc.endLine).not.toMatch(/versie/i);
  });
});

describe("the numbering", () => {
  it("numbers the articles from one, without a gap", () => {
    expect(doc.articles.map((article) => article.number)).toEqual(
      doc.articles.map((_, index) => index + 1),
    );
  });

  it("numbers every clause under its own article, in order", () => {
    for (const article of doc.articles) {
      expect(article.clauses.map((clause) => clause.number)).toEqual(
        article.clauses.map((_, index) => `${article.number}.${index + 1}`),
      );
    }
  });

  it("numbers the appendix clauses in order too", () => {
    expect(doc.appendixA.exit.clauses.map((clause) => clause.number)).toEqual(
      doc.appendixA.exit.clauses.map((_, index) => `A4.${index + 1}`),
    );
  });

  it("has no duplicate clause", () => {
    const numbers = allClauses.map((clause) => clause.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("the cross-references", () => {
  /* A reference to an article that does not exist is a dead end in a
     contract, and nobody notices until a customer follows it. */
  it("only points at articles that exist", () => {
    const articles = new Set(doc.articles.map((article) => article.number));
    for (const clause of allClauses) {
      for (const [, referenced] of clause.text.matchAll(/artikel (\d+)(?:\.\d+)?/gi)) {
        expect(articles, `${clause.number} verwijst naar artikel ${referenced}`).toContain(Number(referenced));
      }
    }
  });

  it("only points at clauses that exist", () => {
    const numbers = new Set(allClauses.map((clause) => clause.number));
    for (const clause of allClauses) {
      for (const [, referenced] of clause.text.matchAll(/artikel (\d+\.\d+)/gi)) {
        expect(numbers, `${clause.number} verwijst naar ${referenced}`).toContain(referenced);
      }
    }
  });
});

/*
  The payment ladder rests on these rights. The wording may be improved; what
  may not happen is that one of them quietly disappears, because the reminder
  mails and the collection flow assume they are here.
*/
describe("what the payment articles must keep saying", () => {
  const article = (number: number) => doc.articles.find((item) => item.number === number)!;
  const textOf = (number: number) => article(number).clauses.map((clause) => clause.text).join(" ");

  it("keeps the 14-day payment term", () => {
    expect(textOf(9)).toContain("14 kalenderdagen");
  });

  /*
    The rate moves every six months, so the terms name the statutory interest
    and leave the number to the law. Scoped to the clauses about arrears: the
    50% deposit in 9.2 is a price arrangement and has nothing to do with it.
  */
  it("names the statutory interest without quoting a percentage", () => {
    const arrears = article(9)
      .clauses.filter((clause) => Number(clause.number.split(".")[1]) >= 7)
      .map((clause) => clause.text)
      .join(" ");

    expect(arrears).toContain("wettelijke handelsrente");
    expect(arrears).toContain("geen eigen rentepercentage");
    expect(arrears).not.toMatch(/\d+([.,]\d+)?\s*%/);
    expect(textOf(24)).not.toMatch(/\d+([.,]\d+)?\s*%/);
  });

  /* The EUR 20 is a contractual right, hedged three ways: not automatic, only
     when actually charged, and never counted twice. */
  it("makes the follow-up charge conditional, and never automatic", () => {
    const nine = textOf(9);
    expect(nine).toContain("EUR 20,00");
    expect(nine).toContain("niet verschuldigd door het enkele verstrijken van de vervaldatum");
    expect(nine).toContain("uitdrukkelijk schriftelijk bij de klant in rekening brengt");
  });

  /*
    There is one claim for collection costs, and the EUR 20 is an instalment
    of it. The wording must never let a customer read two amounts running
    side by side, so the statutory minimum is deliberately not quoted as a
    second number anywhere in the article.
  */
  it("treats the charge as part of one claim, never as an extra on top", () => {
    const nine = textOf(9);
    expect(nine).toContain("één vergoeding voor buitengerechtelijke invorderingskosten");
    expect(nine).toContain("eerste, gedeeltelijke aanspraak");
    expect(nine).toContain("komt daar niet bovenop");
    expect(nine).toContain("volledig in mindering gebracht");
    expect(nine).toContain("nooit dubbel verschuldigd");
  });

  it("quotes no second amount beside the EUR 20", () => {
    const amounts = [...textOf(9).matchAll(/EUR\s[\d.,]+/g)].map(([value]) => value);
    expect(new Set(amounts)).toEqual(new Set(["EUR 2.000", "EUR 20,00"]));
  });

  it("keeps the higher statutory claim open without naming a figure", () => {
    const nine = textOf(9);
    expect(nine).toContain("geen afstand van het meerdere");
    expect(nine).toContain("volgens het toepasselijke recht");
  });

  /*
    The VAT treatment of such a charge depends on how it is qualified, and
    that has not been settled with the bookkeeper. So the clause states an
    amount the customer pays either way and leaves the qualification out of
    it: a wrong assumption cannot make the contract wrong.
  */
  it("states an amount that does not depend on a VAT assumption", () => {
    const nine = textOf(9);
    expect(textOf(8)).toContain("exclusief btw");
    expect(nine).toContain("In afwijking van artikel 8.1");
    expect(nine).toContain("een eventueel daarover verschuldigde btw is daarin begrepen");
    expect(nine).toContain("fiscale kwalificatie van dit bedrag doet aan de hoogte ervan niet af");
    // No claim either way about whether VAT is actually due.
    expect(nine).not.toContain("niet met btw verhoogd");
    expect(nine).not.toContain("geen vergoeding voor een prestatie");
  });

  it("keeps a reminder from moving the due date", () => {
    expect(textOf(9)).toContain("wijzigt de oorspronkelijke vervaldatum niet");
  });

  it("covers recurring invoices and a failed direct debit", () => {
    expect(textOf(9)).toContain("hosting, technisch beheer");
    expect(textOf(9)).toContain("automatische incasso");
    expect(textOf(24)).toContain("automatische incasso");
  });

  /*
    The 1 / 7 / 14 / 21 day ladder is an internal procedure that has to stay
    changeable. The terms may promise a reminder and a reasonable term; they
    may not promise a schedule.
  */
  it("promises reminders without promising a schedule", () => {
    const twentyFour = textOf(24);
    expect(twentyFour).toContain("redelijke aanvullende hersteltermijn");
    expect(twentyFour).toContain("geen recht op een bepaald aantal herinneringen");
    expect(twentyFour).not.toMatch(/\b(1|7|14|21)\s*(kalender)?dagen na de vervaldatum/);
  });

  it("never lets a hand-over happen by itself", () => {
    expect(textOf(24)).toContain("nooit automatisch");
    expect(textOf(24)).toContain("beoordeelt per geval");
  });

  it("keeps suspension proportional and announced", () => {
    const twentyFour = textOf(24);
    expect(twentyFour).toContain("niet lichtvaardig");
    expect(twentyFour).toContain("proportioneel");
    expect(twentyFour).toContain("redelijke voorafgaande waarschuwing");
  });
});

describe("the published PDF", () => {
  const legalDir = join(process.cwd(), "public/legal");

  /* The page links to it, so it has to be there. */
  it("is the file the page links to", () => {
    expect(doc.pdf.path).toBe(`/legal/${doc.pdf.fileName}`);
    expect(existsSync(join(legalDir, doc.pdf.fileName))).toBe(true);
  });

  it("is named after the edition", () => {
    expect(doc.pdf.fileName).toContain(doc.edition);
    expect(doc.pdf.fileName).not.toMatch(/v\d+\.\d+/);
  });

  /* One document, one file: an older edition left lying around is the second
     truth this whole arrangement exists to prevent. */
  it("is the only terms PDF in public/legal", () => {
    const pdfs = readdirSync(legalDir).filter((name) => name.endsWith(".pdf"));
    expect(pdfs).toEqual([doc.pdf.fileName]);
  });

  it("is rendered from the terms module and from nothing else", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/legal/terms-pdf.tsx"), "utf8");
    expect(source).toContain('from "@/lib/content/terms"');
    // No wording of its own: everything the reader sees comes from the data.
    expect(source).not.toContain("Algemene Voorwaarden B2B —");
  });
});
