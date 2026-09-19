import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { invoiceDocumentBucket, readInvoiceArtifact, sha256Hex, storeInvoiceArtifact } from "@/lib/admin/invoices/artifact";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { Invoice } from "@/lib/admin/invoices/types";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The finalization architecture against a real Postgres and a real Storage.
 *
 * Everything else in this repository tests decisions with the database
 * replaced. This tests what only a database can answer: whether the
 * constraints and triggers really refuse what they promise to, what Supabase
 * Storage actually replies when an object already exists, and whether two
 * simultaneous finalizations are safe when the race is real rather than
 * simulated.
 *
 * It runs only against a local stack (`npx supabase start`) and is skipped
 * otherwise, so the ordinary suite stays offline and fast:
 *
 *   SUPABASE_LOCAL_URL=http://127.0.0.1:54321 \
 *   SUPABASE_LOCAL_SERVICE_KEY=… SUPABASE_LOCAL_ANON_KEY=… npx vitest run …
 *
 * It cannot reach production: the URL has to be a loopback address, which is
 * checked before anything is written, and asserted again as a test.
 */
const url = process.env.SUPABASE_LOCAL_URL ?? "";
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? "";
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? "";
const loopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const local = loopback.test(url) && Boolean(serviceKey) && Boolean(anonKey);

/* No Next request context here, so cache revalidation is a no-op. */
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

const { cancelInvoice, finalizeInvoice } = await import("@/lib/admin/invoices/finalize");
const { invoiceDocumentFile } = await import("@/lib/admin/invoices/document-actions");
const { sendInvoiceToCustomer } = await import("@/lib/admin/documents/send");
const { ensureRecurringInvoice } = await import("@/lib/payments/recurring-invoice");
const { renderInvoicePdf } = await import("@/lib/admin/pdf/to-buffer");

/** Elevated, for setting the stage and for looking behind the policies. */
let service: SupabaseClient<Database>;
let customerId: string;
const madeInvoices: string[] = [];
const madeServices: string[] = [];
const storedPaths = new Set<string>();

async function createConcept(overrides: Record<string, unknown> = {}): Promise<string> {
  const seed = Math.random().toString(36).slice(-5).toUpperCase();
  const { data, error } = await service
    .from("invoices")
    .insert({
      number_value: `FAC-CONCEPT-${seed}`,
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
      due_date: "2026-10-04",
      payment_reference: `FAC-CONCEPT-${seed}`,
      notes: "",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw new Error(`concept: ${error.message}`);

  const id = data!.id;
  madeInvoices.push(id);
  const lines = await service.rpc("save_invoice_lines", {
    p_invoice_id: id,
    p_lines: [{ description: "Werk", quantityHundredths: 100, unitPriceCents: 150000, vatRate: 21 }] as never,
  });
  if (lines.error) throw new Error(`lines: ${lines.error.message}`);
  return id;
}

async function readRow(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await service.from("invoices").select("*").eq("id", id).single();
  if (error) throw new Error(`row: ${error.message}`);
  return data as unknown as Record<string, unknown>;
}

async function readInvoice(id: string): Promise<Invoice> {
  const { data, error } = await service.from("invoices").select(invoiceColumns).eq("id", id).single();
  if (error) throw new Error(`invoice: ${error.message}`);
  return invoiceFromRow(data as unknown as InvoiceRow);
}

/** The bytes that are really in the bucket. */
async function objectBytes(path: string): Promise<Buffer> {
  const { data, error } = await service.storage.from(invoiceDocumentBucket).download(path);
  if (error || !data) throw new Error(`download: ${error?.message ?? "geen bestand"}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Where the yearly invoice sequence stands right now. */
async function counter(): Promise<number> {
  const { data, error } = await service
    .from("document_counters")
    .select("next_sequence")
    .eq("kind", "invoice")
    .eq("year", 2026)
    .maybeSingle();
  if (error) throw new Error(`counter: ${error.message}`);
  return data?.next_sequence ?? 1;
}

async function pathOf(id: string): Promise<string> {
  const row = await readRow(id);
  const path = row.document_path as string | null;
  if (!path) throw new Error("geen document_path");
  storedPaths.add(path);
  return path;
}

beforeAll(async () => {
  if (!local) return;

  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

  /*
    A real admin session, because that is what the application runs as. Row
    level security and the storage policies decide everything below, and a
    service-role client would prove nothing about either.
  */
  const email = `validation+${Date.now()}@example.test`;
  const password = "validation-only-password";
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`admin user: ${created.error.message}`);

  const profile = await service
    .from("admin_profiles")
    .insert({ user_id: created.data.user!.id, display_name: "Validation" });
  if (profile.error) throw new Error(`admin profile: ${profile.error.message}`);

  admin = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const signedIn = await admin.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`sign in: ${signedIn.error.message}`);

  const customer = await service
    .from("customers")
    .insert({
      company_name: "Alfa BV",
      contact_name: "A. Alfa",
      email: "alfa@example.test",
      street: "Straat 1",
      postal_code: "1011 AA",
      city: "Amsterdam",
      country: "Nederland",
    })
    .select("id")
    .single();
  if (customer.error) throw new Error(`customer: ${customer.error.message}`);
  customerId = customer.data!.id;

  deliverEmail.mockResolvedValue({ sent: true, sentAt: "2026-09-20T10:00:00.000Z", messageId: "local-1" });
}, 120_000);

afterAll(async () => {
  if (!local || !service) return;
  /* Local only; the rule about never deleting a document is a production rule. */
  for (const path of storedPaths) await service.storage.from(invoiceDocumentBucket).remove([path]);
  await service.from("customer_communications").delete().eq("customer_id", customerId);
  for (const id of madeServices) await service.from("recurring_services").delete().eq("id", id);
  for (const id of madeInvoices) await service.from("invoices").delete().eq("id", id);
  if (customerId) await service.from("customers").delete().eq("id", customerId);
}, 120_000);

describe.runIf(local)("the stack under test", () => {
  it("is local, and is not the production project", () => {
    expect(url).toMatch(loopback);
    expect(url).not.toContain("supabase.co");
    expect(url).not.toContain("wbrqbuctwzpobnvcsomt");
  });

  /*
    The premise of the whole artifact design: two renders of one invoice are
    two different files. If this ever stopped being true, byte identity could
    be had by rendering twice -- and the design would be unnecessary.
  */
  it("renders two different files from one invoice", async () => {
    const id = await createConcept();
    const invoice = await readInvoice(id);

    const first = await renderInvoicePdf(invoice);
    const second = await renderInvoicePdf(invoice);

    expect(first.equals(second)).toBe(false);
    expect(sha256Hex(first)).not.toBe(sha256Hex(second));
  }, 60_000);
});

describe.runIf(local)("the bucket", () => {
  it("is private, PDF-only and capped at 10 MB", async () => {
    const { data, error } = await service
      .from("buckets" as never)
      .select("*")
      .eq("id", invoiceDocumentBucket)
      .maybeSingle();
    /* The table lives in the storage schema, so go through the API instead. */
    void data;
    void error;

    const buckets = await service.storage.listBuckets();
    const bucket = buckets.data?.find((item) => item.name === invoiceDocumentBucket);

    expect(bucket).toBeDefined();
    expect(bucket!.public).toBe(false);
    expect(bucket!.file_size_limit).toBe(10 * 1024 * 1024);
    expect(bucket!.allowed_mime_types).toEqual(["application/pdf"]);
  });

  /*
    The real duplicate response. Everything about the adopt flow hangs on
    recognising it, so it is asserted here in the exact shape the storage
    client hands over -- and printed, because a message we only guessed at is
    how this design could fail quietly.
  */
  it("refuses a second upload to the same path, and leaves the first alone", async () => {
    const path = `validation/${Date.now()}-duplicate.pdf`;
    storedPaths.add(path);
    const a = Buffer.from("%PDF-1.7\n% file A\n%%EOF\n");
    const b = Buffer.from("%PDF-1.7\n% file B, different length\n%%EOF\n");

    const first = await admin.storage.from(invoiceDocumentBucket).upload(path, a, {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(first.error).toBeNull();

    const second = await admin.storage.from(invoiceDocumentBucket).upload(path, b, {
      contentType: "application/pdf",
      upsert: false,
    });

    console.log("DUPLICATE UPLOAD ERROR:", JSON.stringify(second.error, Object.getOwnPropertyNames(second.error ?? {})));
    expect(second.error).not.toBeNull();

    /* A is still A: the second upload wrote nothing. */
    expect((await objectBytes(path)).equals(a)).toBe(true);
  });

  /* No update policy and no delete policy: the admin session may not. */
  it("refuses an overwrite and a delete from an admin session", async () => {
    const path = `validation/${Date.now()}-immutable.pdf`;
    storedPaths.add(path);
    const original = Buffer.from("%PDF-1.7\n% original\n%%EOF\n");
    await admin.storage.from(invoiceDocumentBucket).upload(path, original, { contentType: "application/pdf" });

    const overwrite = await admin.storage.from(invoiceDocumentBucket).upload(path, Buffer.from("%PDF-1.7\n% other\n"), {
      contentType: "application/pdf",
      upsert: true,
    });
    console.log("OVERWRITE ERROR:", JSON.stringify(overwrite.error, Object.getOwnPropertyNames(overwrite.error ?? {})));
    expect(overwrite.error).not.toBeNull();

    const removed = await admin.storage.from(invoiceDocumentBucket).remove([path]);
    console.log("DELETE RESULT:", JSON.stringify({ data: removed.data, error: removed.error }));

    /* Whatever the API answers, the object is still there and unchanged. */
    expect((await objectBytes(path)).equals(original)).toBe(true);
  });
});

describe.runIf(local)("making a concept definitive", () => {
  it("numbers it, stores one PDF and records that file", async () => {
    const id = await createConcept();

    const result = await finalizeInvoice(id);

    expect(result.ok).toBe(true);
    const row = await readRow(id);
    const path = await pathOf(id);

    expect(row.number_value).toMatch(/^YM-F-2026-\d{6}$/);
    expect(row.number_provisional).toBe(false);
    expect(row.status).toBe("issued");
    expect(row.finalizing_at).not.toBeNull();
    expect(row.issued_at).not.toBeNull();
    // The concept reference followed the number it became.
    expect(row.payment_reference).toBe(row.number_value);

    const bytes = await objectBytes(path);
    expect(path).toBe(`2026/${row.number_value}-${sha256Hex(bytes)}.pdf`);
    expect(row.document_sha256).toBe(sha256Hex(bytes));
    expect(row.document_bytes).toBe(bytes.byteLength);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);

  it("keeps a payment reference the admin typed", async () => {
    const id = await createConcept({ payment_reference: "PO-4417" });

    await finalizeInvoice(id);

    const row = await readRow(id);
    await pathOf(id);
    expect(row.payment_reference).toBe("PO-4417");
    expect(row.number_value).toMatch(/^YM-F-2026-\d{6}$/);
  }, 60_000);

  it("freezes what the document says about a monthly service", async () => {
    const id = await createConcept();
    const created = await service
      .from("recurring_services")
      .insert({
        customer_id: customerId,
        name: "Websitebeheer",
        amount_cents: 2500,
        vat_rate: 21,
        starts_on: "2026-11-01",
        status: "draft",
        activation_invoice_id: id,
      })
      .select("id")
      .single();
    if (created.error) throw new Error(`service: ${created.error.message}`);
    madeServices.push(created.data!.id);

    await finalizeInvoice(id);
    await pathOf(id);

    const row = await readRow(id);
    expect(row.activation_note).toMatchObject({
      serviceId: created.data!.id,
      serviceName: "Websitebeheer",
      monthlyNetCents: 2500,
      monthlyGrossCents: 3025,
      firstDebitOn: "2026-11-01",
    });

    /* And renaming the service afterwards does not move the document. */
    await service.from("recurring_services").update({ name: "Iets anders" }).eq("id", created.data!.id);
    const again = await readRow(id);
    expect((again.activation_note as { serviceName: string }).serviceName).toBe("Websitebeheer");
  }, 60_000);
});

describe.runIf(local)("two finalizations at the same moment", () => {
  it("issues one number, stores one file and hands both callers that file", async () => {
    const id = await createConcept();
    const before = await counter();

    const [first, second] = await Promise.all([finalizeInvoice(id), finalizeInvoice(id)]);

    /* The yearly sequence moved exactly once for these two callers. */
    expect(await counter()).toBe(before + 1);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.ok && second.ok && first.value === second.value).toBe(true);

    const row = await readRow(id);
    const path = await pathOf(id);
    const bytes = await objectBytes(path);

    // One number, one object, and the row describes that object exactly.
    expect(row.number_value).toBe(first.ok ? first.value : "");
    expect(row.document_path).toBe(`2026/${row.number_value}-${sha256Hex(bytes)}.pdf`);
    expect(row.document_sha256).toBe(sha256Hex(bytes));
    expect(row.document_bytes).toBe(bytes.byteLength);
    expect(row.issued_at).not.toBeNull();

    const listed = await service.storage.from(invoiceDocumentBucket).list("2026", { search: `${row.number_value}-` });
    expect(listed.data!.length).toBeGreaterThanOrEqual(1);
    for (const object of listed.data ?? []) storedPaths.add(`2026/${object.name}`);

    // The counter moved once: no second number went out for this invoice.
    const others = await service.from("invoices").select("number_value").eq("number_value", row.number_value as string);
    expect(others.data).toHaveLength(1);
  }, 120_000);
});

describe.runIf(local)("two uploads of one document, genuinely at once", () => {
  /*
    The race at its sharpest: both writes are in flight before either has
    answered, and they carry different bytes. Neither may damage the other,
    and each has to come back describing bytes that are really at its path.
  */
  it("keeps both renders intact, each under its own hash", async () => {
    const id = await createConcept();
    const numbered = await admin.rpc("begin_invoice_finalization", { p_invoice_id: id });
    expect(numbered.error).toBeNull();
    const invoice = await readInvoice(id);

    const a = Buffer.from("%PDF-1.7\n% caller A\n%%EOF\n");
    const b = Buffer.from("%PDF-1.7\n% caller B, a different length entirely\n%%EOF\n");
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));

    const [first, second] = await Promise.all([
      storeInvoiceArtifact(admin, invoice, a),
      storeInvoiceArtifact(admin, invoice, b),
    ]);
    storedPaths.add(first.path);
    storedPaths.add(second.path);

    /*
      Storage does not arbitrate and is not asked to: measured against this
      very stack, two uploads issued at one instant to one key are both
      accepted and the later one wins. So each render goes to its own path,
      and every returned artifact describes the bytes at its own path --
      which is the property the row then relies on.
    */
    for (const stored of [first, second]) {
      const bytes = await objectBytes(stored.path);
      expect(sha256Hex(bytes)).toBe(stored.sha256);
      expect(bytes.byteLength).toBe(stored.bytes);
      expect(stored.path.endsWith(`${stored.sha256}.pdf`)).toBe(true);
    }

    // Neither overwrote the other: both files are intact and different.
    expect((await objectBytes(first.path)).equals(first.path.includes(sha256Hex(a)) ? a : b)).toBe(true);
    expect((await objectBytes(second.path)).equals(second.path.includes(sha256Hex(a)) ? a : b)).toBe(true);
  }, 120_000);

  /*
    The same race through the whole action, twenty times over. The invariant
    is not "one object" -- two renders may both be stored -- but that the
    invoice ends up pointing at bytes that hash to what it recorded, every
    single time, and that the number series moves once per invoice.
  */
  it("never leaves a row and a file that disagree", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const id = await createConcept();
      const before = await counter();

      const [a, b] = await Promise.all([finalizeInvoice(id), finalizeInvoice(id)]);
      expect(a.ok, `attempt ${attempt}: first caller`).toBe(true);
      expect(b.ok, `attempt ${attempt}: second caller`).toBe(true);
      expect(a.ok && b.ok && a.value === b.value).toBe(true);
      expect(await counter(), `attempt ${attempt}: counter`).toBe(before + 1);

      const row = await readRow(id);
      const path = row.document_path as string;
      storedPaths.add(path);
      const bytes = await objectBytes(path);

      expect(row.issued_at, `attempt ${attempt}: issued`).not.toBeNull();
      expect(sha256Hex(bytes), `attempt ${attempt}: hash`).toBe(row.document_sha256);
      expect(bytes.byteLength, `attempt ${attempt}: size`).toBe(row.document_bytes);

      /* Any render that lost is at its own path, still intact. */
      const listed = await service.storage.from(invoiceDocumentBucket).list("2026", { search: `${row.number_value}-` });
      for (const object of listed.data ?? []) {
        const other = `2026/${object.name}`;
        storedPaths.add(other);
        expect(object.name.endsWith(`${sha256Hex(await objectBytes(other))}.pdf`), `attempt ${attempt}: ${other}`).toBe(true);
      }
    }
  }, 300_000);
});

describe.runIf(local)("a finalization that died before recording the file", () => {
  it("adopts the stored file on the retry, and throws the new render away", async () => {
    const id = await createConcept();

    /* Step one and the upload, then nothing: the process is gone. */
    const numbered = await admin.rpc("begin_invoice_finalization", { p_invoice_id: id });
    expect(numbered.error).toBeNull();
    const invoice = await readInvoice(id);
    const orphan = await renderInvoicePdf(invoice);
    const stored = await storeInvoiceArtifact(admin, invoice, orphan);
    storedPaths.add(stored.path);

    const half = await readRow(id);
    expect(half.issued_at).toBeNull();
    expect(half.document_path).toBeNull();
    expect(half.number_provisional).toBe(false);

    const retried = await finalizeInvoice(id);

    expect(retried).toEqual({ ok: true, value: numbered.data });
    const row = await readRow(id);
    const bytes = await objectBytes(stored.path);

    // The file from before the crash, not the retry's own render.
    expect(bytes.equals(orphan)).toBe(true);
    expect(row.document_sha256).toBe(sha256Hex(orphan));
    expect(row.document_bytes).toBe(orphan.byteLength);
    expect(row.number_value).toBe(numbered.data);
    expect(row.issued_at).not.toBeNull();
  }, 120_000);
});

describe.runIf(local)("the preview and the attachment", () => {
  it("are the same bytes as the stored object", async () => {
    const id = await createConcept();
    await finalizeInvoice(id);
    const path = await pathOf(id);
    const row = await readRow(id);

    const preview = await invoiceDocumentFile(id);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    deliverEmail.mockClear();
    const sent = await sendInvoiceToCustomer(id);
    expect(sent.ok).toBe(true);

    const mailed = deliverEmail.mock.calls[0]![0] as { attachments: { content: Buffer }[] };
    const attached = Buffer.from(mailed.attachments[0]!.content);
    const previewed = Buffer.from(preview.value.base64, "base64");
    const inBucket = await objectBytes(path);

    expect(previewed.equals(inBucket)).toBe(true);
    expect(attached.equals(inBucket)).toBe(true);
    expect(sha256Hex(previewed)).toBe(row.document_sha256);
    expect(sha256Hex(attached)).toBe(row.document_sha256);

    /* And sending changed nothing about the document. */
    const after = await readRow(id);
    expect(after.document_sha256).toBe(row.document_sha256);
    expect(after.number_value).toBe(row.number_value);
    expect(after.payment_reference).toBe(row.payment_reference);
    expect(after.status).toBe("sent");
    expect(after.sent_at).not.toBeNull();
  }, 120_000);
});

describe.runIf(local)("what the database refuses once an invoice is numbered", () => {
  it("refuses every change the design calls final", async () => {
    const id = await createConcept();
    await finalizeInvoice(id);
    const path = await pathOf(id);
    const row = await readRow(id);

    const refusals = await Promise.all([
      admin.from("invoices").update({ issue_date: "2026-01-01" }).eq("id", id),
      admin.from("invoices").update({ payment_reference: "ANDERS" }).eq("id", id),
      admin.from("invoices").update({ customer_company_name: "Beta BV" }).eq("id", id),
      admin.from("invoices").update({ notes: "aangepast" }).eq("id", id),
      admin.from("invoices").update({ document_sha256: "b".repeat(64) }).eq("id", id),
      admin.from("invoices").update({ document_path: "2026/elders.pdf" }).eq("id", id),
      admin.from("invoices").update({ issued_at: null }).eq("id", id),
      admin.from("invoices").update({ number_value: "YM-F-2026-999999" }).eq("id", id),
      admin.from("invoices").update({ status: "draft" }).eq("id", id),
      admin.from("invoice_lines").update({ unit_price_cents: 1 }).eq("invoice_id", id),
      admin.from("invoice_lines").delete().eq("invoice_id", id),
    ]);

    for (const [index, refusal] of refusals.entries()) {
      expect(refusal.error, `update ${index} should have been refused`).not.toBeNull();
    }

    /* Nothing moved. */
    const after = await readRow(id);
    expect(after).toMatchObject({
      number_value: row.number_value,
      payment_reference: row.payment_reference,
      issue_date: row.issue_date,
      document_sha256: row.document_sha256,
      status: "issued",
    });
    expect((await objectBytes(path)).byteLength).toBe(row.document_bytes);

    /* And asking for a number again gives the one it has. */
    const again = await admin.rpc("begin_invoice_finalization", { p_invoice_id: id });
    expect(again.data).toBe(row.number_value);
  }, 120_000);

  it("refuses to record a different artifact for a document that has one", async () => {
    const id = await createConcept();
    await finalizeInvoice(id);
    await pathOf(id);
    const row = await readRow(id);

    const rogue = await admin.rpc("complete_invoice_finalization", {
      p_invoice_id: id,
      p_path: row.document_path as string,
      p_sha256: "c".repeat(64),
      p_bytes: 999,
    });

    expect(rogue.error).not.toBeNull();
    expect((await readRow(id)).document_sha256).toBe(row.document_sha256);
  }, 60_000);
});

describe.runIf(local)("an invoice that is cancelled before it is sent", () => {
  it("keeps its number, its file and its place in the series", async () => {
    const id = await createConcept();
    const numbered = await admin.rpc("begin_invoice_finalization", { p_invoice_id: id });
    const invoice = await readInvoice(id);
    const stored = await storeInvoiceArtifact(admin, invoice, await renderInvoicePdf(invoice));
    storedPaths.add(stored.path);

    const cancelled = await cancelInvoice(id);
    expect(cancelled.ok).toBe(true);

    const row = await readRow(id);
    expect(row.status).toBe("cancelled");
    expect(row.number_value).toBe(numbered.data);
    expect(row.number_provisional).toBe(false);

    /* No way back, no second number, and the orphan file is left alone. */
    const backToDraft = await admin.from("invoices").update({ status: "draft" }).eq("id", id);
    expect(backToDraft.error).not.toBeNull();

    const retry = await finalizeInvoice(id);
    expect(retry).toEqual({ ok: false, error: "Een geannuleerde factuur wordt niet definitief gemaakt." });
    expect((await readRow(id)).number_value).toBe(numbered.data);

    const sent = await sendInvoiceToCustomer(id);
    expect(sent.ok).toBe(false);

    expect((await objectBytes(stored.path)).byteLength).toBeGreaterThan(0);
  }, 120_000);
});

describe.runIf(local)("a monthly term", () => {
  it("is issued through the same flow, with one PDF that later mails reuse", async () => {
    const created = await service
      .from("recurring_services")
      .insert({
        customer_id: customerId,
        name: "Websitebeheer maandelijks",
        amount_cents: 2500,
        vat_rate: 21,
        starts_on: "2026-11-01",
        status: "active",
      })
      .select("id, customer_id, name, description, amount_cents, currency, vat_rate, billing_interval, starts_on, status, project_id, activation_invoice_id, mollie_subscription_id, created_at, updated_at")
      .single();
    if (created.error) throw new Error(`service: ${created.error.message}`);
    madeServices.push(created.data!.id);

    const { recurringServiceFromRow } = await import("@/lib/payments/mapper");
    const recurring = recurringServiceFromRow(created.data as never);
    const period = { start: "2026-11-01", end: "2026-11-30" };

    const term = await ensureRecurringInvoice(admin, recurring, period, "2026-10-18");
    madeInvoices.push(term.id);
    const path = await pathOf(term.id);

    expect(term.number.value).toMatch(/^YM-F-2026-\d{6}$/);
    expect(term.paymentReference).toBe(term.number.value);
    expect(term.document?.path).toBe(path);

    const bytes = await objectBytes(path);
    expect(term.document?.sha256).toBe(sha256Hex(bytes));

    /* The job runs again: same invoice, same file, no second render. */
    const again = await ensureRecurringInvoice(admin, recurring, period, "2026-10-18");
    expect(again.id).toBe(term.id);
    expect(again.document?.sha256).toBe(term.document?.sha256);
    const listed = await service.storage.from(invoiceDocumentBucket).list("2026", { search: `${term.number.value}-` });
    expect(listed.data).toHaveLength(1);

    /* What a term's mail attaches is that stored file. */
    const artifact = await readInvoiceArtifact(admin, await readInvoice(term.id));
    expect(artifact.ok).toBe(true);
    expect(artifact.ok && artifact.pdf.equals(bytes)).toBe(true);

    /* Not sent, so nothing chases it: reminders key on sent_at. */
    const row = await readRow(term.id);
    expect(row.sent_at).toBeNull();
  }, 120_000);
});
