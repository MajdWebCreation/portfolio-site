import type { SupabaseClient } from "@supabase/supabase-js";
import { storeInvoiceArtifact } from "@/lib/admin/invoices/artifact";
import { renderQuotePdf } from "@/lib/admin/pdf/to-buffer";
import { quoteColumns, quoteFromRow, type QuoteRow } from "@/lib/admin/quotes/mapper";
import type { Quote } from "@/lib/admin/quotes/types";
import { currentTermsSet } from "@/lib/payments/service-agreement";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Turning a concept quote into a document with a file.
 *
 * The same four steps an invoice takes, for the same reasons (see
 * invoices/issue.ts): storage and Postgres are not one transaction, so the
 * two things that have to be true together -- this quote is definitive, and
 * this is its PDF -- are written by one statement at the end, and everything
 * that can fail happens before it.
 *
 *   1. `begin_quote_issue` takes the number and records the set of general
 *      terms the quote is issued under. From here the row is frozen.
 *      Idempotent: a second call returns the number the first one took and
 *      leaves the terms alone.
 *   2. The row is read back, now numbered, and rendered. Once.
 *   3. The bytes go to the bucket under a path that contains their own hash,
 *      so no two renders can ever aim at the same object.
 *   4. `complete_quote_issue` records path, hash and size. It does that
 *      once; a caller offering a different artifact is refused and handed the
 *      one the quote has.
 *
 * The terms are read here, from the one legal source, at the moment the
 * number is taken: that is the set the customer is offered, and a set
 * published later does not apply to a quote that already exists.
 *
 * Between 1 and 4 the quote is numbered, frozen and not yet a document. The
 * send flow does not reach the mailer in that state; running it again adopts
 * whatever exists and finishes, on the same number.
 */
export type IssueQuoteResult =
  | {
      ok: true;
      number: string;
      document: { path: string; sha256: string; bytes: number };
      /** True when this call found the PDF already there instead of storing one. */
      adopted: boolean;
    }
  | { ok: false; error: string };

/** The jsonb `complete_quote_issue` hands back, read defensively. */
function completionResult(value: unknown): { number: string; path: string; sha256: string; bytes: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { number, path, sha256, bytes } = value as Record<string, unknown>;
  if (typeof number !== "string" || typeof path !== "string" || typeof sha256 !== "string" || typeof bytes !== "number") {
    return undefined;
  }
  return { number, path, sha256, bytes };
}

async function readQuote(db: SupabaseClient<Database>, id: string): Promise<Quote | undefined> {
  const { data, error } = await db.from("quotes").select(quoteColumns).eq("id", id).maybeSingle();
  if (error) throw new Error(`Offerte laden: ${error.message}`);
  return data ? quoteFromRow(data as unknown as QuoteRow) : undefined;
}

export async function issueQuoteDocument(db: SupabaseClient<Database>, quoteId: string): Promise<IssueQuoteResult> {
  const terms = currentTermsSet();
  const numbered = await db.rpc("begin_quote_issue", {
    p_quote_id: quoteId,
    p_terms_edition: terms.edition,
    p_terms_published_on: terms.publishedOn,
  });
  if (numbered.error || !numbered.data) {
    return { ok: false, error: numbered.error?.message ?? "Het offertenummer kon niet worden toegekend." };
  }

  const quote = await readQuote(db, quoteId);
  if (!quote) return { ok: false, error: "Deze offerte bestaat niet (meer)." };

  /* Already a document. Its file is its file; nothing is rendered again. */
  if (quote.document) {
    return { ok: true, number: quote.number.value, document: quote.document, adopted: true };
  }

  let pdf: Buffer;
  try {
    pdf = await renderQuotePdf(quote);
  } catch (error) {
    console.error("Quote PDF render failed", { quoteId, error });
    return { ok: false, error: "De PDF kon niet worden gemaakt. Controleer de regels en probeer opnieuw." };
  }

  let stored;
  try {
    stored = await storeInvoiceArtifact(db, quote, pdf, "Offerte");
  } catch (error) {
    console.error("Quote PDF upload failed", { quoteId, error });
    return {
      ok: false,
      error: `De PDF kon niet worden opgeslagen, dus de offerte is niet verstuurd: ${
        error instanceof Error ? error.message : "onbekende fout"
      }. Probeer het opnieuw; het nummer ${quote.number.value} blijft van deze offerte.`,
    };
  }

  const completed = await db.rpc("complete_quote_issue", {
    p_quote_id: quoteId,
    p_path: stored.path,
    p_sha256: stored.sha256,
    p_bytes: stored.bytes,
  });

  if (completed.error) {
    /*
      The quote may have become a document while this call was rendering --
      another tab, a double click. The database refuses to swap one artifact
      for another, which is right; for this caller it is not a failure: the
      quote has a file, just not the one it happened to make.
    */
    const current = await readQuote(db, quoteId);
    if (current?.document) {
      console.info("Another issue won; this render is unreferenced", {
        quoteId,
        kept: current.document.path,
        discarded: stored.path,
      });
      return { ok: true, number: current.number.value, document: current.document, adopted: true };
    }
    return { ok: false, error: completed.error.message };
  }

  const result = completionResult(completed.data);
  if (!result) return { ok: false, error: "De offerte kon niet worden uitgegeven." };

  if (stored.adopted) {
    console.info("Quote already had a stored PDF; adopted it", { quoteId, path: result.path });
  }

  return {
    ok: true,
    number: result.number,
    document: { path: result.path, sha256: result.sha256, bytes: result.bytes },
    adopted: stored.adopted,
  };
}
