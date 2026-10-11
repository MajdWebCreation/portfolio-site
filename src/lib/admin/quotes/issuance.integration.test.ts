import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { invoiceDocumentBucket, sha256Hex } from "@/lib/admin/invoices/artifact";
import { quoteColumns, quoteFromRow, type QuoteRow } from "@/lib/admin/quotes/mapper";
import type { Quote } from "@/lib/admin/quotes/types";
import { termsDocument } from "@/lib/content/terms";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The quote issuance architecture against a real Postgres and a real Storage.
 *
 * Everything else about quotes is tested with the database replaced. This
 * tests what only a database can answer: that the constraints and triggers
 * really refuse what the migration promises, and that the whole send -- number,
 * terms, file, mail, freeze -- holds up with a real bucket behind it.
 *
 * It runs only against a local stack (`npx supabase start`) and is skipped
 * otherwise, so the ordinary suite stays offline and fast:
 *
 *   SUPABASE_LOCAL_URL=http://127.0.0.1:54321 \
 *   SUPABASE_LOCAL_SERVICE_KEY=… SUPABASE_LOCAL_ANON_KEY=… npx vitest run …
 *
 * It cannot reach production: the URL has to be a loopback address, which is
 * checked before anything is written, and asserted again as a test.
 *
 * Numbered quotes are records the database refuses to delete, for every
 * role; so this suite leaves the quotes it numbered, and their customer, in
 * the local database. That is the rule under test, and a local stack is
 * disposable.
 */
const url = process.env.SUPABASE_LOCAL_URL ?? "";
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? "";
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? "";
const loopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const local = loopback.test(url) && Boolean(serviceKey) && Boolean(anonKey);

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/* The two boundaries this must never cross. */
const deliverEmail = vi.fn();
vi.mock("@/lib/admin/communications/provider", () => ({
  deliverEmail: (...args: unknown[]) => deliverEmail(...args),
}));
vi.mock("@/lib/mollie/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/config")>()),
  isMollieConfigured: () => false,
}));

/* The admin session the application code runs under. */
let admin: SupabaseClient<Database>;
vi.mock("@/lib/admin/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/admin/db")>();
  return { ...original, adminDb: async () => admin };
});

const { sendQuoteToCustomer } = await import("@/lib/admin/documents/send");
const { quoteDocumentFile } = await import("@/lib/admin/quotes/document-actions");
const { createQuoteRevision, setQuoteOutcome } = await import("@/lib/admin/quotes/lifecycle");
const { renderQuotePdf } = await import("@/lib/admin/pdf/to-buffer");

/** Elevated, for setting the stage and for looking behind the policies. */
let service: SupabaseClient<Database>;
let customerId: string;
let otherCustomerId: string;
const madeDrafts: string[] = [];
const storedPaths = new Set<string>();

async function createConcept(overrides: Record<string, unknown> = {}, forCustomer = customerId): Promise<string> {
  const seed = Math.random().toString(36).slice(-5).toUpperCase();
  const { data, error } = await service
    .from("quotes")
    .insert({
      number_value: `OFF-CONCEPT-${seed}`,
      number_provisional: true,
      status: "draft",
      customer_id: forCustomer,
      customer_company_name: "Alfa BV",
      customer_contact_name: "A. Alfa",
      customer_email: "alfa@example.test",
      customer_street: "Straat 1",
      customer_postal_code: "1011 AA",
      customer_city: "Amsterdam",
      customer_country: "Nederland",
      issue_date: "2026-09-20",
      valid_until: "2026-10-20",
      subject: "Website",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw new Error(`concept: ${error.message}`);

  const id = data!.id;
  madeDrafts.push(id);
  const lines = await service.rpc("save_quote_lines", {
    p_quote_id: id,
    p_lines: [{ description: "Werk", quantityHundredths: 100, unitPriceCents: 150000, vatRate: 21 }] as never,
  });
  if (lines.error) throw new Error(`lines: ${lines.error.message}`);
  return id;
}

async function readRow(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await service.from("quotes").select("*").eq("id", id).single();
  if (error) throw new Error(`row: ${error.message}`);
  return data as unknown as Record<string, unknown>;
}

async function readQuote(id: string): Promise<Quote> {
  const { data, error } = await service.from("quotes").select(quoteColumns).eq("id", id).single();
  if (error) throw new Error(`quote: ${error.message}`);
  return quoteFromRow(data as unknown as QuoteRow);
}

async function objectBytes(path: string): Promise<Buffer> {
  const { data, error } = await service.storage.from(invoiceDocumentBucket).download(path);
  if (error || !data) throw new Error(`download: ${error?.message ?? "geen bestand"}`);
  return Buffer.from(await data.arrayBuffer());
}

async function counter(): Promise<number> {
  const { data, error } = await service
    .from("document_counters")
    .select("next_sequence")
    .eq("kind", "quote")
    .eq("year", 2026)
    .maybeSingle();
  if (error) throw new Error(`counter: ${error.message}`);
  return data?.next_sequence ?? 1;
}

/** A sent quote, through the real action. */
async function sendNew(overrides: Record<string, unknown> = {}): Promise<string> {
  const id = await createConcept(overrides);
  const sent = await sendQuoteToCustomer(id);
  if (!sent.ok) throw new Error(`send: ${sent.error}`);
  const row = await readRow(id);
  storedPaths.add(row.document_path as string);
  return id;
}

beforeAll(async () => {
  if (!local) return;

  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

  const email = `quote-validation+${Date.now()}@example.test`;
  const password = "validation-only-password";
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`admin user: ${created.error.message}`);
  const profile = await service.from("admin_profiles").insert({ user_id: created.data.user!.id, display_name: "Validation" });
  if (profile.error) throw new Error(`admin profile: ${profile.error.message}`);

  admin = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const signedIn = await admin.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`sign in: ${signedIn.error.message}`);

  for (const [index, name] of ["Alfa BV", "Beta BV"].entries()) {
    const customer = await service
      .from("customers")
      .insert({
        company_name: name,
        contact_name: "A. Alfa",
        email: `quote-validation-${index}-${Date.now()}@example.test`,
        street: "Straat 1",
        postal_code: "1011 AA",
        city: "Amsterdam",
        country: "Nederland",
      })
      .select("id")
      .single();
    if (customer.error) throw new Error(`customer: ${customer.error.message}`);
    if (index === 0) customerId = customer.data!.id;
    else otherCustomerId = customer.data!.id;
  }

  deliverEmail.mockResolvedValue({ sent: true, sentAt: "2026-09-20T10:00:00.000Z", messageId: "local-1" });
}, 120_000);

afterAll(async () => {
  if (!local || !service) return;
  /* Only what the database allows to go: concepts. Numbered quotes and their customer stay; see the header. */
  for (const id of madeDrafts) {
    const row = await service.from("quotes").select("number_provisional").eq("id", id).maybeSingle();
    if (row.data?.number_provisional) await service.from("quotes").delete().eq("id", id);
  }
}, 120_000);

describe.runIf(local)("the stack under test", () => {
  it("is local, and is not the production project", () => {
    expect(url).toMatch(loopback);
    expect(url).not.toContain("supabase.co");
    expect(url).not.toContain("wbrqbuctwzpobnvcsomt");
  });

  /* Two renders are two files, which is why the file has to be stored. */
  it("renders two different files from one quote", async () => {
    const id = await createConcept();
    const quote = await readQuote(id);
    const first = await renderQuotePdf(quote);
    const second = await renderQuotePdf(quote);
    expect(first.equals(second)).toBe(false);
  }, 60_000);
});

describe.runIf(local)("sending a concept", () => {
  it("numbers it, snapshots the terms, stores one file, mails it and freezes the row", async () => {
    const id = await createConcept();
    const before = await counter();

    const result = await sendQuoteToCustomer(id);

    expect(result.ok).toBe(true);
    expect(await counter()).toBe(before + 1);
    const row = await readRow(id);
    const path = row.document_path as string;
    storedPaths.add(path);
    const bytes = await objectBytes(path);

    expect(row.number_value).toMatch(/^YM-O-2026-\d{6}$/);
    expect(row.number_provisional).toBe(false);
    expect(row.status).toBe("sent");
    expect(row.sent_at).not.toBeNull();
    expect(row.terms_edition).toBe(termsDocument.edition);
    expect(row.terms_published_on).toBe(termsDocument.dateIso);
    expect(row.legacy_sent_without_document).toBe(false);
    expect(path).toBe(`2026/${row.number_value}-${sha256Hex(bytes)}.pdf`);
    expect(row.document_sha256).toBe(sha256Hex(bytes));
    expect(row.document_bytes).toBe(bytes.byteLength);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

    /* The attachment is the object in the bucket. */
    const mailed = deliverEmail.mock.calls.at(-1)![0] as { attachments: { content: Buffer }[] };
    expect(Buffer.from(mailed.attachments[0]!.content).equals(bytes)).toBe(true);

    /* And the preview is the same bytes. */
    const preview = await quoteDocumentFile(id);
    expect(preview.ok && Buffer.from(preview.value.base64, "base64").equals(bytes)).toBe(true);
  }, 60_000);

  it("refuses every change the design calls final", async () => {
    const id = await sendNew();
    const row = await readRow(id);

    const refusals = await Promise.all([
      admin.from("quotes").update({ subject: "Anders" }).eq("id", id),
      admin.from("quotes").update({ intro: "Anders" }).eq("id", id),
      admin.from("quotes").update({ notes: "Anders" }).eq("id", id),
      admin.from("quotes").update({ issue_date: "2026-01-01" }).eq("id", id),
      admin.from("quotes").update({ valid_until: "2027-01-01" }).eq("id", id),
      admin.from("quotes").update({ customer_company_name: "Beta BV" }).eq("id", id),
      admin.from("quotes").update({ customer_street: "Elders 2" }).eq("id", id),
      admin.from("quotes").update({ customer_id: otherCustomerId }).eq("id", id),
      admin.from("quotes").update({ number_value: "YM-O-2026-999999" }).eq("id", id),
      admin.from("quotes").update({ document_sha256: "b".repeat(64) }).eq("id", id),
      admin.from("quotes").update({ document_path: "2026/elders.pdf" }).eq("id", id),
      admin.from("quotes").update({ document_path: null, document_sha256: null, document_bytes: null, document_generated_at: null }).eq("id", id),
      admin.from("quotes").update({ terms_edition: "2027", terms_published_on: "2027-01-01" }).eq("id", id),
      admin.from("quotes").update({ sent_at: "2026-01-01T00:00:00.000Z" }).eq("id", id),
      admin.from("quotes").update({ status: "draft" }).eq("id", id),
      admin.from("quotes").update({ legacy_sent_without_document: true }).eq("id", id),
      admin.from("quote_lines").update({ unit_price_cents: 1 }).eq("quote_id", id),
      admin.from("quote_lines").delete().eq("quote_id", id),
      admin.from("quote_lines").insert({ quote_id: id, position: 9, description: "Extra", quantity_hundredths: 100, unit_price_cents: 1, vat_rate: 21 }),
      /* Moving a line to a concept would take a figure out of the frozen document. */
      admin.from("quote_lines").update({ quote_id: await createConcept() }).eq("quote_id", id),
      admin.from("quotes").update({ created_at: "2020-01-01T00:00:00.000Z" }).eq("id", id),
      admin.rpc("save_quote_lines", { p_quote_id: id, p_lines: [{ description: "Anders", quantityHundredths: 100, unitPriceCents: 1, vatRate: 21 }] as never }),
      admin.from("quotes").delete().eq("id", id),
      service.from("quotes").delete().eq("id", id),
    ]);

    for (const [index, refusal] of refusals.entries()) {
      expect(refusal.error, `change ${index} should have been refused`).not.toBeNull();
    }

    const after = await readRow(id);
    expect(after).toEqual(row);
    const lines = await service.from("quote_lines").select("unit_price_cents").eq("quote_id", id);
    expect(lines.data).toEqual([{ unit_price_cents: 150000 }]);
  }, 60_000);

  it("refuses to record a different artifact for a quote that has one", async () => {
    const id = await sendNew();
    const row = await readRow(id);

    const rogue = await admin.rpc("complete_quote_issue", {
      p_quote_id: id,
      p_path: row.document_path as string,
      p_sha256: "c".repeat(64),
      p_bytes: 999,
    });
    expect(rogue.error).not.toBeNull();

    const same = await admin.rpc("complete_quote_issue", {
      p_quote_id: id,
      p_path: row.document_path as string,
      p_sha256: row.document_sha256 as string,
      p_bytes: row.document_bytes as number,
    });
    expect(same.error).toBeNull();
    expect((same.data as { adopted: boolean }).adopted).toBe(true);
    expect((await readRow(id)).document_sha256).toBe(row.document_sha256);
  }, 60_000);

  it("keeps the terms it was issued under when asked again with another set", async () => {
    const id = await sendNew();

    const again = await admin.rpc("begin_quote_issue", { p_quote_id: id, p_terms_edition: "2031", p_terms_published_on: "2031-01-01" });

    expect(again.error).toBeNull();
    expect(again.data).toBe((await readRow(id)).number_value);
    expect((await readRow(id)).terms_edition).toBe(termsDocument.edition);
  }, 60_000);

  it("issues without terms to nobody", async () => {
    const id = await createConcept();
    const refused = await admin.rpc("begin_quote_issue", { p_quote_id: id, p_terms_edition: "", p_terms_published_on: "2026-09-29" });
    expect(refused.error).not.toBeNull();
    expect((await readRow(id)).number_provisional).toBe(true);
  }, 60_000);
});

describe.runIf(local)("a numbered quote that was never mailed", () => {
  it("cannot be called sent, accepted or rejected", async () => {
    const id = await createConcept();
    const numbered = await admin.rpc("begin_quote_issue", {
      p_quote_id: id,
      p_terms_edition: termsDocument.edition,
      p_terms_published_on: termsDocument.dateIso,
    });
    expect(numbered.error).toBeNull();

    for (const status of ["sent", "accepted", "rejected", "expired"]) {
      const claim = await service.from("quotes").update({ status }).eq("id", id);
      expect(claim.error, status).not.toBeNull();
    }
    expect((await readRow(id)).status).toBe("draft");

    const decided = await setQuoteOutcome(id, "accepted");
    expect(decided.ok).toBe(false);
  }, 60_000);
});

describe.runIf(local)("resending", () => {
  it("mails the identical file, renders nothing and moves nothing", async () => {
    const id = await sendNew();
    const row = await readRow(id);
    const bytes = await objectBytes(row.document_path as string);
    deliverEmail.mockClear();

    const again = await sendQuoteToCustomer(id);

    expect(again.ok).toBe(true);
    const mailed = deliverEmail.mock.calls[0]![0] as { attachments: { content: Buffer }[] };
    expect(Buffer.from(mailed.attachments[0]!.content).equals(bytes)).toBe(true);
    expect(await readRow(id)).toEqual(row);

    const listed = await service.storage.from(invoiceDocumentBucket).list("2026", { search: `${row.number_value}-` });
    expect(listed.data).toHaveLength(1);
  }, 60_000);
});

describe.runIf(local)("a replaced quote", () => {
  it("is not mailed again once its new version went out", async () => {
    const id = await sendNew();
    const revision = await createQuoteRevision(id);
    if (!revision.ok) throw new Error(revision.error);
    madeDrafts.push(revision.value);

    /* While the new version is a concept, the old one is still the offer the customer has. */
    const meanwhile = await sendQuoteToCustomer(id);
    expect(meanwhile.ok).toBe(true);

    const sentRevision = await sendQuoteToCustomer(revision.value);
    expect(sentRevision.ok).toBe(true);
    storedPaths.add((await readRow(revision.value)).document_path as string);
    deliverEmail.mockClear();

    const again = await sendQuoteToCustomer(id);

    expect(again.ok).toBe(false);
    expect(again.ok === false && again.error).toContain("vervangen door");
    expect(deliverEmail).not.toHaveBeenCalled();
  }, 120_000);
});

describe.runIf(local)("a send that died before the file was recorded", () => {
  it("is finished by the next send, on the same number and with the earlier file", async () => {
    const id = await createConcept();
    const numbered = await admin.rpc("begin_quote_issue", {
      p_quote_id: id,
      p_terms_edition: termsDocument.edition,
      p_terms_published_on: termsDocument.dateIso,
    });
    expect(numbered.error).toBeNull();
    const before = await counter();

    /* The render was stored, then the process died. */
    const { storeInvoiceArtifact } = await import("@/lib/admin/invoices/artifact");
    const quote = await readQuote(id);
    const orphan = await renderQuotePdf(quote);
    const stored = await storeInvoiceArtifact(admin, quote, orphan, "Offerte");
    storedPaths.add(stored.path);
    expect((await readRow(id)).document_path).toBeNull();

    /* A frozen, numbered quote refuses content changes already. */
    const edit = await admin.from("quotes").update({ subject: "Anders" }).eq("id", id);
    expect(edit.error).not.toBeNull();

    const sent = await sendQuoteToCustomer(id);

    expect(sent.ok).toBe(true);
    expect(await counter()).toBe(before);
    const row = await readRow(id);
    expect(row.number_value).toBe(numbered.data);
    expect(row.document_sha256).toBe(sha256Hex(orphan));
    expect(row.sent_at).not.toBeNull();
  }, 60_000);
});

describe.runIf(local)("a new version", () => {
  it("is a concept pointing at the sent quote, which stays intact", async () => {
    const id = await sendNew();
    const before = await readRow(id);

    const revision = await createQuoteRevision(id);

    expect(revision.ok).toBe(true);
    if (!revision.ok) return;
    madeDrafts.push(revision.value);
    const row = await readRow(revision.value);
    expect(row).toMatchObject({
      supersedes_quote_id: id,
      customer_id: customerId,
      status: "draft",
      number_provisional: true,
      subject: "Website",
      document_path: null,
      terms_edition: null,
      sent_at: null,
    });
    const lines = await service.from("quote_lines").select("description, unit_price_cents").eq("quote_id", revision.value);
    expect(lines.data).toEqual([{ description: "Werk", unit_price_cents: 150000 }]);
    expect(await readRow(id)).toEqual(before);
  }, 60_000);

  it("is refused a second time, for a concept, for an accepted quote and across customers", async () => {
    const id = await sendNew();
    const first = await createQuoteRevision(id);
    expect(first.ok).toBe(true);
    if (first.ok) madeDrafts.push(first.value);

    /* Straight at the table: the unique index, not the action, is the rule. */
    const second = await service.from("quotes").insert({
      ...(await conceptColumns()),
      supersedes_quote_id: id,
    });
    expect(second.error).not.toBeNull();
    expect(second.error!.code).toBe("23505");

    const ofConcept = await service.from("quotes").insert({
      ...(await conceptColumns()),
      supersedes_quote_id: await createConcept(),
    });
    expect(ofConcept.error?.message).toContain("nog niet verzonden");

    const acceptedId = await sendNew();
    const accepted = await setQuoteOutcome(acceptedId, "accepted");
    expect(accepted.ok).toBe(true);
    const ofAccepted = await service.from("quotes").insert({
      ...(await conceptColumns()),
      supersedes_quote_id: acceptedId,
    });
    expect(ofAccepted.error?.message).toContain("geaccepteerd");

    const crossCustomer = await service.from("quotes").insert({
      ...(await conceptColumns()),
      customer_id: otherCustomerId,
      supersedes_quote_id: await sendNew(),
    });
    expect(crossCustomer.error).not.toBeNull();
  }, 120_000);

  it("never changes which quote it supersedes", async () => {
    const id = await sendNew();
    const revision = await createQuoteRevision(id);
    if (!revision.ok) throw new Error(revision.error);
    madeDrafts.push(revision.value);

    const other = await sendNew();
    const moved = await service.from("quotes").update({ supersedes_quote_id: other }).eq("id", revision.value);
    expect(moved.error?.message).toContain("ligt vast sinds het aanmaken");

    const cleared = await service.from("quotes").update({ supersedes_quote_id: null }).eq("id", revision.value);
    expect(cleared.error).not.toBeNull();

    /* The predecessor cannot go either: a successor points at it. */
    const gone = await service.from("quotes").delete().eq("id", id);
    expect(gone.error).not.toBeNull();
  }, 120_000);

  /* The concept itself can still be removed: nothing was spent on it. */
  it("can be thrown away while it is a concept", async () => {
    const id = await sendNew();
    const revision = await createQuoteRevision(id);
    if (!revision.ok) throw new Error(revision.error);

    const removed = await admin.from("quotes").delete().eq("id", revision.value);
    expect(removed.error).toBeNull();
    expect((await service.from("quotes").select("id").eq("id", revision.value)).data).toEqual([]);
  }, 60_000);
});

describe.runIf(local)("a new row", () => {
  it("has to be a concept, whatever it claims", async () => {
    const claims = await Promise.all([
      service.from("quotes").insert({ ...(await conceptColumns()), number_value: "YM-O-2026-000777", number_provisional: false }),
      service.from("quotes").insert({ ...(await conceptColumns()), sent_at: "2026-09-01T10:00:00.000Z" }),
      service.from("quotes").insert({ ...(await conceptColumns()), legacy_sent_without_document: true }),
      service.from("quotes").insert({ ...(await conceptColumns()), terms_edition: "2026", terms_published_on: "2026-09-29" }),
      service.from("quotes").insert({ ...(await conceptColumns()), status: "sent" }),
    ]);
    for (const [index, claim] of claims.entries()) {
      expect(claim.error, `insert ${index} should have been refused`).not.toBeNull();
    }
  }, 60_000);
});

/** A concept row as the builder writes it, for inserts that test one deviation from it. */
async function conceptColumns(): Promise<Database["public"]["Tables"]["quotes"]["Insert"]> {
  return {
    number_value: `OFF-CONCEPT-${Math.random().toString(36).slice(-5).toUpperCase()}`,
    number_provisional: true,
    status: "draft",
    customer_id: customerId,
    customer_company_name: "Alfa BV",
    customer_contact_name: "A. Alfa",
    customer_email: "alfa@example.test",
    customer_street: "Straat 1",
    customer_postal_code: "1011 AA",
    customer_city: "Amsterdam",
    customer_country: "Nederland",
    issue_date: "2026-09-20",
    valid_until: "2026-10-20",
    subject: "Website",
  };
}
