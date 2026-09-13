import { cache } from "react";
import { getArticle } from "@/lib/admin/articles/repository";
import { getCustomer } from "@/lib/admin/customers/repository";
import { getInquiry } from "@/lib/admin/inquiries/repository";
import { getInvoice } from "@/lib/admin/invoices/repository";
import { getLead } from "@/lib/admin/leads/repository";
import { getProject } from "@/lib/admin/projects/repository";
import { getQuote } from "@/lib/admin/quotes/repository";

/**
 * The single-record reads an admin page does, deduplicated per request.
 *
 * Every detail route asks for the same record twice: once in
 * `generateMetadata` to put the customer or the invoice number in the tab
 * title, and once in the page itself. Those run in the same render, so the
 * second read is a second round trip to Supabase for a row that is already in
 * memory. `cache()` from React holds the promise for the length of one
 * request, which turns the pair back into one query.
 *
 * Deliberately a layer on top of the repositories rather than `cache()` around
 * the repository functions themselves. Server actions read the same records --
 * `documents/send.ts` reads a quote before it sends it, `payments/actions.ts`
 * reads a service before it changes one -- and an action's write and the
 * re-render that follows it happen inside a single request. A cached read
 * there would hand the re-render the row as it was before the write. Pages
 * read through this module; actions keep reading the repository directly, and
 * see what they just wrote.
 *
 * Request-scoped and nothing more: no value survives a request, so no admin
 * ever sees a row that was read for someone else.
 */
export const readArticle = cache(getArticle);
export const readCustomer = cache(getCustomer);
export const readInquiry = cache(getInquiry);
export const readInvoice = cache(getInvoice);
export const readLead = cache(getLead);
export const readProject = cache(getProject);
export const readQuote = cache(getQuote);
