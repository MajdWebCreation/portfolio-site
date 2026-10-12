import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { invoiceDocumentBucket, sha256Hex } from "@/lib/admin/invoices/artifact";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The portal's read models against a real Postgres, a real Auth server and a
 * real Storage.
 *
 * The documents are made the way the admin makes them -- quotes sent,
 * invoices made definitive and sent, payments and credit notes and refunds
 * recorded -- for two customers. Then seven callers ask every portal
 * function and the bucket: a member of each customer, a member of both, a
 * member whose access was revoked, an admin without a membership, a signed-in
 * stranger, and anon. What each gets back is compared with what they may
 * have, column by column.
 *
 * Local only (`npx supabase start`, Node 22):
 *
 *   SUPABASE_LOCAL_URL=http://127.0.0.1:54321 \
 *   SUPABASE_LOCAL_SERVICE_KEY=… SUPABASE_LOCAL_ANON_KEY=… npx vitest run …
 *
 * Numbered documents cannot be deleted, so what this suite numbers stays in
 * the local database; a local stack is disposable.
 */
const url = process.env.SUPABASE_LOCAL_URL ?? "";
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? "";
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? "";
const loopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const local = loopback.test(url) && Boolean(serviceKey) && Boolean(anonKey);

/* The document route reads the stored file on the server's own client, after the member's session proved it theirs. */
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.SUPABASE_SECRET_KEY = serviceKey;

/* No Next request context: cookies are a jar, redirects a marker. */
const jar = new Map<string, string>();
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));
class Redirected extends Error {
  constructor(public readonly to: string) {
    super(`redirect:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new Redirected("404");
  },
}));

/* The two boundaries the admin flows must never cross. */
const deliverEmail = vi.fn();
vi.mock("@/lib/admin/communications/provider", () => ({ deliverEmail: (...args: unknown[]) => deliverEmail(...args) }));
vi.mock("@/lib/mollie/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/config")>()),
  isMollieConfigured: () => false,
}));

/* The admin session the admin flows run under, and the visitor session the portal reads under. */
let admin: SupabaseClient<Database>;
let visitor: SupabaseClient<Database>;
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => admin,
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin: async () => ({ userId: "00000000-0000-4000-8000-000000000000", email: null, displayName: null }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => visitor }));

const { sendQuoteToCustomer, sendInvoiceToCustomer } = await import("@/lib/admin/documents/send");
const { createQuoteRevision } = await import("@/lib/admin/quotes/lifecycle");
const { finalizeInvoice } = await import("@/lib/admin/invoices/finalize");
const { recordManualPayment } = await import("@/lib/payments/payment-actions");
const { createManualCreditNote } = await import("@/lib/admin/credit-notes/actions");
const { markCreditNoteRefundedManually } = await import("@/lib/payments/refund-actions");
const { readPortalInvoices, readPortalInvoice } = await import("@/lib/portal/invoices/read");
const { readPortalQuotes, readPortalQuote } = await import("@/lib/portal/quotes/read");
const { readPortalServices } = await import("@/lib/portal/services/read");
const { readPortalCustomer } = await import("@/lib/portal/customers/read");
const { readPortalDocumentFile } = await import("@/lib/portal/privileged");
const { portalInvoiceView } = await import("@/lib/portal/invoices/model");
const { portalServiceView } = await import("@/lib/portal/services/model");
const { PortalDenied } = await import("@/lib/portal/rpc");
const { resolvePortalAccess, portalCustomerCookie } = await import("@/lib/portal/auth");
const { selectCustomerAction } = await import("@/lib/portal/auth-actions");
const { GET: documentRoute } = await import("@/app/portaal/documenten/[kind]/[id]/route");

type Db = SupabaseClient<Database>;
let service: Db;

const password = "portal-read-models-password";
const stamp = Date.now();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());

/* What only the administration may know; none of it may come back from a portal function. */
const secrets = ["INTERNAL-NOTE", "INTERNAL-SUB", "INTERNAL-PROBLEM", "INTERNAL-LABEL", "INTERNAL-SPECIAL", "INTERNAL-REVISION-NOTE", "INTERNAL-PAYMENT", "INTERNAL-INTRO", "INTERNAL-QUOTE-NOTES", "INTERNAL-INVOICE-NOTES", "INTERNAL-REASON", "INTERNAL-DEVIATION"];

const ids = {
  alfa: "",
  beta: "",
  alfaUser: "",
  betaUser: "",
  multiUser: "",
  revokedUser: "",
  strangerUser: "",
  revokedMembership: "",
};
const docs = {
  alfaPartlyPaid: "", // sent, part paid
  alfaRefunded: "", // sent, paid in full, credited, refunded
  alfaIssuedOnly: "", // definitive, never sent
  alfaConcept: "",
  alfaCreditNote: "",
  betaInvoice: "",
  alfaQuoteV1: "",
  alfaQuoteV2: "",
  alfaQuoteConcept: "",
  alfaLegacyQuote: "",
  betaQuote: "",
  alfaService: "",
  alfaDraftService: "",
  betaService: "",
};
const paths = { alfaInvoice: "", alfaIssuedOnly: "", alfaQuote: "", alfaCreditNote: "" };
const clients = {} as Record<"alfa" | "beta" | "multi" | "revoked" | "stranger" | "anon", Db>;

async function signedIn(email: string): Promise<Db> {
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

async function createUser(label: string): Promise<{ id: string; email: string }> {
  const email = `portal-read-${label}-${stamp}@example.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`user ${label}: ${error.message}`);
  return { id: data.user!.id, email };
}

async function createCustomer(name: string): Promise<string> {
  const { data, error } = await service
    .from("customers")
    .insert({
      company_name: `${name} ${stamp}`,
      contact_name: `Contact ${name}`,
      email: `portal-read-${name.toLowerCase()}-${stamp}@example.test`,
      phone: "020 123 4567",
      street: "Straat 1",
      postal_code: "1011 AA",
      city: "Amsterdam",
      country: "Nederland",
      kvk_number: "12345678",
      notes: "INTERNAL-NOTE about this customer",
    })
    .select("id")
    .single();
  if (error) throw new Error(`customer ${name}: ${error.message}`);
  return data!.id;
}

async function member(userId: string, customerId: string, email: string): Promise<string> {
  const { data, error } = await service.from("customer_users").insert({ user_id: userId, customer_id: customerId, invited_email: email }).select("id").single();
  if (error) throw new Error(`membership: ${error.message}`);
  return data!.id;
}

async function invoiceConcept(customerId: string, name: string, unitPriceCents = 100000): Promise<string> {
  const seed = Math.random().toString(36).slice(-6).toUpperCase();
  const { data, error } = await service
    .from("invoices")
    .insert({
      number_value: `FAC-CONCEPT-${seed}`,
      number_provisional: true,
      status: "draft",
      customer_id: customerId,
      customer_company_name: name,
      customer_contact_name: "Contact",
      customer_email: `portal-read-doc-${seed}@example.test`,
      customer_street: "Straat 1",
      customer_postal_code: "1011 AA",
      customer_city: "Amsterdam",
      customer_country: "Nederland",
      issue_date: today,
      due_date: today,
      payment_reference: "",
      notes: "INTERNAL-INVOICE-NOTES",
    })
    .select("id")
    .single();
  if (error) throw new Error(`invoice concept: ${error.message}`);
  const lines = await service.rpc("save_invoice_lines", {
    p_invoice_id: data!.id,
    p_lines: [{ description: "Website", quantityHundredths: 100, unitPriceCents, vatRate: 21 }] as never,
  });
  if (lines.error) throw new Error(`invoice lines: ${lines.error.message}`);
  return data!.id;
}

async function sentInvoice(customerId: string, name: string, unitPriceCents = 100000): Promise<string> {
  const id = await invoiceConcept(customerId, name, unitPriceCents);
  const issued = await finalizeInvoice(id);
  if (!issued.ok) throw new Error(`finalize: ${issued.error}`);
  const sent = await sendInvoiceToCustomer(id);
  if (!sent.ok) throw new Error(`send invoice: ${sent.error}`);
  return id;
}

async function quoteConcept(customerId: string, name: string): Promise<string> {
  const seed = Math.random().toString(36).slice(-6).toUpperCase();
  const { data, error } = await service
    .from("quotes")
    .insert({
      number_value: `OFF-CONCEPT-${seed}`,
      number_provisional: true,
      status: "draft",
      customer_id: customerId,
      customer_company_name: name,
      customer_contact_name: "Contact",
      customer_email: `portal-read-q-${seed}@example.test`,
      customer_street: "Straat 1",
      customer_postal_code: "1011 AA",
      customer_city: "Amsterdam",
      customer_country: "Nederland",
      issue_date: today,
      valid_until: "2099-12-31",
      subject: "Nieuwe website",
      intro: "INTERNAL-INTRO",
      notes: "INTERNAL-QUOTE-NOTES",
    })
    .select("id")
    .single();
  if (error) throw new Error(`quote concept: ${error.message}`);
  const lines = await service.rpc("save_quote_lines", {
    p_quote_id: data!.id,
    p_lines: [{ description: "Ontwerp en bouw", quantityHundredths: 100, unitPriceCents: 250000, vatRate: 21 }] as never,
  });
  if (lines.error) throw new Error(`quote lines: ${lines.error.message}`);
  return data!.id;
}

async function sentQuote(customerId: string, name: string): Promise<string> {
  const id = await quoteConcept(customerId, name);
  const sent = await sendQuoteToCustomer(id);
  if (!sent.ok) throw new Error(`send quote: ${sent.error}`);
  return id;
}

async function column<T>(table: "invoices" | "quotes" | "credit_notes", id: string, name: string): Promise<T> {
  const { data, error } = await service.from(table).select(name).eq("id", id).single();
  if (error) throw new Error(`${table}.${name}: ${error.message}`);
  return (data as unknown as Record<string, T>)[name]!;
}

/** As the database superuser, past the triggers: only for a state the application can no longer make. */
function psql(statement: string): void {
  execFileSync("docker", ["exec", "supabase_db_portfolio-site", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", statement], { stdio: "pipe" });
}

async function recurringService(customerId: string, status: string, startsOn: string | null): Promise<string> {
  const { data, error } = await admin.rpc("create_recurring_service", {
    p_customer_id: customerId,
    p_name: "Websitebeheer",
    p_description: "",
    p_amount_cents: 2500,
    p_vat_rate: 21,
    p_starts_on: startsOn as string,
    p_status: status,
    p_effective_from: startsOn ?? today,
    p_terms_edition: "2026",
    p_terms_published_on: "2026-09-14",
    p_note: "INTERNAL-REVISION-NOTE",
  });
  if (error) throw new Error(`service: ${error.message}`);
  return data as string;
}

type RpcCall = { name: string; call: (db: Db, customerId: string) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> };

/** Every portal read, named with the customer it asks for. */
function reads(): RpcCall[] {
  return [
    { name: "portal_customer", call: (db, c) => db.rpc("portal_customer", { p_customer_id: c }) },
    { name: "portal_invoices", call: (db, c) => db.rpc("portal_invoices", { p_customer_id: c }) },
    { name: "portal_invoice", call: (db, c) => db.rpc("portal_invoice", { p_customer_id: c, p_invoice_id: docs.alfaPartlyPaid }) },
    { name: "portal_quotes", call: (db, c) => db.rpc("portal_quotes", { p_customer_id: c }) },
    { name: "portal_quote", call: (db, c) => db.rpc("portal_quote", { p_customer_id: c, p_quote_id: docs.alfaQuoteV2 }) },
    { name: "portal_services", call: (db, c) => db.rpc("portal_services", { p_customer_id: c }) },
    { name: "portal_document", call: (db, c) => db.rpc("portal_document", { p_customer_id: c, p_kind: "invoice", p_id: docs.alfaPartlyPaid }) },
  ];
}

function refused(result: { data: unknown; error: { code?: string; message: string } | null }, label: string) {
  expect(result.error, `${label} should be refused`).not.toBeNull();
  expect(result.error!.code, label).toBe("42501");
  expect(result.data, label).toBeNull();
}

async function download(db: Db, path: string): Promise<Buffer | null> {
  const { data, error } = await db.storage.from(invoiceDocumentBucket).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** A stored PDF the way the portal serves it: proved on the member's session, read by the server. Null when refused. */
async function served(client: Db, customerId: string, kind: "invoice" | "credit_note" | "quote", id: string): Promise<Buffer | null> {
  visitor = client;
  try {
    return (await readPortalDocumentFile({ customerId }, kind, id)).pdf;
  } catch (error) {
    if (error instanceof PortalDenied) return null;
    throw error;
  }
}

async function as<T>(client: Db, read: () => Promise<T>): Promise<T> {
  visitor = client;
  return read();
}

async function denied(read: Promise<unknown>): Promise<boolean> {
  try {
    await read;
    return false;
  } catch (error) {
    if (error instanceof PortalDenied) return true;
    throw error;
  }
}

beforeAll(async () => {
  if (!local) return;
  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

  /* An admin, signed in, for the admin flows; with no membership, for the portal. */
  const adminUser = await createUser("admin");
  const profile = await service.from("admin_profiles").insert({ user_id: adminUser.id, display_name: "Portal read validation" });
  if (profile.error) throw new Error(`admin profile: ${profile.error.message}`);
  admin = await signedIn(adminUser.email);

  ids.alfa = await createCustomer("Alfa");
  ids.beta = await createCustomer("Beta");

  deliverEmail.mockResolvedValue({ sent: true, sentAt: new Date().toISOString(), messageId: "local" });

  // ------------------------------------------------------------ Alfa
  docs.alfaPartlyPaid = await sentInvoice(ids.alfa, "Alfa");
  const part = await recordManualPayment(docs.alfaPartlyPaid, { amountCents: 21000, paidOn: today, note: "INTERNAL-PAYMENT" });
  if (!part.ok) throw new Error(`payment: ${part.error}`);
  paths.alfaInvoice = await column<string>("invoices", docs.alfaPartlyPaid, "document_path");
  /* An internal payment id on a successful payment, which the portal must never echo. */
  await service.from("payments").update({ provider_payment_id: "tr_INTERNAL-PAYMENT" }).eq("invoice_id", docs.alfaPartlyPaid);

  docs.alfaRefunded = await sentInvoice(ids.alfa, "Alfa", 50000);
  const full = await recordManualPayment(docs.alfaRefunded, { amountCents: 60500, paidOn: today, note: "INTERNAL-PAYMENT" });
  if (!full.ok) throw new Error(`payment: ${full.error}`);
  const note = await createManualCreditNote(docs.alfaRefunded, {
    reason: "INTERNAL-REASON",
    issueDate: today,
    lines: [{ description: "Korting", quantityHundredths: 100, unitPriceCents: 10000, vatRate: 21 }],
  });
  if (!note.ok) throw new Error(`credit note: ${note.error}`);
  docs.alfaCreditNote = note.value.id;
  paths.alfaCreditNote = await column<string>("credit_notes", docs.alfaCreditNote, "document_path");
  const refund = await markCreditNoteRefundedManually(docs.alfaCreditNote, { amountCents: 12100, settledOn: today, note: "INTERNAL-PAYMENT" });
  if (!refund.ok) throw new Error(`refund: ${refund.error}`);

  docs.alfaIssuedOnly = await invoiceConcept(ids.alfa, "Alfa");
  const issuedOnly = await finalizeInvoice(docs.alfaIssuedOnly);
  if (!issuedOnly.ok) throw new Error(`finalize: ${issuedOnly.error}`);
  paths.alfaIssuedOnly = await column<string>("invoices", docs.alfaIssuedOnly, "document_path");
  docs.alfaConcept = await invoiceConcept(ids.alfa, "Alfa");

  docs.alfaQuoteV1 = await sentQuote(ids.alfa, "Alfa");
  paths.alfaQuote = await column<string>("quotes", docs.alfaQuoteV1, "document_path");
  const revision = await createQuoteRevision(docs.alfaQuoteV1);
  if (!revision.ok) throw new Error(`revision: ${revision.error}`);
  docs.alfaQuoteV2 = revision.value;
  docs.alfaQuoteConcept = await quoteConcept(ids.alfa, "Alfa");
  /* A quote sent before quotes were stored: the marker only the migration ever set. */
  docs.alfaLegacyQuote = await quoteConcept(ids.alfa, "Alfa");
  psql(
    `set session_replication_role = replica; update public.quotes set number_value = 'YM-O-LEGACY-${stamp}', number_provisional = false, status = 'sent', sent_at = now(), legacy_sent_without_document = true where id = '${docs.alfaLegacyQuote}';`,
  );

  docs.alfaService = await recurringService(ids.alfa, "active", "2026-09-15");
  const internals = await service
    .from("recurring_services")
    .update({ mollie_subscription_id: `sub_INTERNAL-SUB-${stamp}`, lifecycle_problem: "INTERNAL-PROBLEM", subscription_claim_id: crypto.randomUUID(), subscription_claimed_at: new Date().toISOString() })
    .eq("id", docs.alfaService);
  if (internals.error) throw new Error(`service internals: ${internals.error.message}`);
  const head = await service.from("recurring_service_agreements").select("id").eq("recurring_service_id", docs.alfaService).single();
  const amended = await service.from("recurring_service_agreements").insert({
    recurring_service_id: docs.alfaService,
    customer_id: ids.alfa,
    supersedes_id: head.data!.id,
    effective_from: "2026-10-01",
    source_kind: "accepted_offer",
    source_label: "INTERNAL-LABEL",
    accepted_on: "2026-09-30",
    notice_months: 2,
    minimum_term_months: 12,
    special_terms: "INTERNAL-SPECIAL",
    terms_edition: "2026",
    terms_published_on: "2026-09-14",
    note: "INTERNAL-REVISION-NOTE",
  });
  if (amended.error) throw new Error(`agreement: ${amended.error.message}`);
  const change = await service.from("recurring_price_changes").insert({
    recurring_service_id: docs.alfaService,
    customer_id: ids.alfa,
    old_amount_cents: 2500,
    new_amount_cents: 3000,
    effective_from: "2099-01-15",
    provider_updated_at: new Date().toISOString(),
  });
  if (change.error) throw new Error(`price change: ${change.error.message}`);
  const blocked = await service.from("recurring_price_changes").insert({
    recurring_service_id: docs.alfaService,
    customer_id: ids.alfa,
    old_amount_cents: 2500,
    new_amount_cents: 9900,
    effective_from: "2026-01-15",
    canceled_at: new Date().toISOString(),
    canceled_reason: "withdrawn",
  });
  if (blocked.error) throw new Error(`withdrawn change: ${blocked.error.message}`);
  docs.alfaDraftService = await recurringService(ids.alfa, "draft", null);

  // ------------------------------------------------------------ Beta
  docs.betaInvoice = await sentInvoice(ids.beta, "Beta");
  docs.betaQuote = await sentQuote(ids.beta, "Beta");
  docs.betaService = await recurringService(ids.beta, "awaiting_mandate", "2026-11-01");

  // ------------------------------------------------------------ people
  const alfaUser = await createUser("alfa");
  const betaUser = await createUser("beta");
  const multiUser = await createUser("multi");
  const revokedUser = await createUser("revoked");
  const strangerUser = await createUser("stranger");
  ids.alfaUser = alfaUser.id;
  ids.betaUser = betaUser.id;
  ids.multiUser = multiUser.id;
  ids.revokedUser = revokedUser.id;
  ids.strangerUser = strangerUser.id;
  await member(alfaUser.id, ids.alfa, alfaUser.email);
  await member(betaUser.id, ids.beta, betaUser.email);
  await member(multiUser.id, ids.alfa, multiUser.email);
  await member(multiUser.id, ids.beta, multiUser.email);
  ids.revokedMembership = await member(revokedUser.id, ids.alfa, revokedUser.email);

  clients.alfa = await signedIn(alfaUser.email);
  clients.beta = await signedIn(betaUser.email);
  clients.multi = await signedIn(multiUser.email);
  clients.revoked = await signedIn(revokedUser.email);
  clients.stranger = await signedIn(strangerUser.email);
  clients.anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
}, 300_000);

afterAll(async () => {
  if (!local || !service) return;
  /* Memberships of these test users go with the users; numbered documents and their customers stay (see the header). */
  for (const id of [ids.alfaUser, ids.betaUser, ids.multiUser, ids.revokedUser, ids.strangerUser]) {
    if (id) await service.auth.admin.deleteUser(id);
  }
}, 120_000);

describe.runIf(local)("the stack under test", () => {
  it("is local, and is not the production project", () => {
    expect(url).toMatch(loopback);
    expect(url).not.toContain("supabase.co");
    expect(url).not.toContain("wbrqbuctwzpobnvcsomt");
  });
});

describe.runIf(local)("who gets nothing", () => {
  it("anon may not execute a single portal read", async () => {
    for (const read of reads()) {
      const result = await read.call(clients.anon, ids.alfa);
      expect(result.error, read.name).not.toBeNull();
      expect(result.data, read.name).toBeNull();
    }
  });

  it("a signed-in stranger, an admin without membership and a revoked member are refused for every read", async () => {
    await service.from("customer_users").update({ revoked_at: new Date().toISOString() }).eq("id", ids.revokedMembership);
    for (const [label, client] of [
      ["stranger", clients.stranger],
      ["admin", admin],
      ["revoked", clients.revoked],
    ] as const) {
      for (const read of reads()) {
        refused(await read.call(client, ids.alfa), `${label} ${read.name}`);
        refused(await read.call(client, ids.beta), `${label} ${read.name} (beta)`);
      }
    }
  });

  it("a revoked member loses access in the middle of a session, and gets it back only by a new membership", async () => {
    await service.from("customer_users").update({ revoked_at: null }).eq("id", ids.revokedMembership);
    const before = await clients.revoked.rpc("portal_invoices", { p_customer_id: ids.alfa });
    expect(before.error).toBeNull();
    expect(await served(clients.revoked, ids.alfa, "invoice", docs.alfaPartlyPaid)).not.toBeNull();

    await service.from("customer_users").update({ revoked_at: new Date().toISOString() }).eq("id", ids.revokedMembership);
    refused(await clients.revoked.rpc("portal_invoices", { p_customer_id: ids.alfa }), "after revocation");
    expect(await served(clients.revoked, ids.alfa, "invoice", docs.alfaPartlyPaid)).toBeNull();
    expect(await download(clients.revoked, paths.alfaInvoice)).toBeNull();
  });

  it("nobody reaches a business table directly", async () => {
    for (const client of [clients.alfa, clients.anon]) {
      for (const table of ["customers", "invoices", "quotes", "payments", "credit_notes", "refunds", "recurring_services", "recurring_price_changes", "recurring_service_agreements"] as const) {
        const { data } = await client.from(table).select("id").limit(5);
        expect(data ?? [], `${table}`).toEqual([]);
      }
    }
  });
});

describe.runIf(local)("the customer", () => {
  it("each member reads their own customer's details, and only the safe columns", async () => {
    const own = await clients.alfa.rpc("portal_customer", { p_customer_id: ids.alfa });
    expect(own.error).toBeNull();
    expect(Object.keys(own.data![0]!).sort()).toEqual(["city", "company_name", "contact_name", "country", "email", "kvk_number", "phone", "postal_code", "street", "vat_number"]);
    expect(JSON.stringify(own.data)).not.toContain("INTERNAL");

    const details = await as(clients.beta, () => readPortalCustomer(ids.beta));
    expect(details.companyName).toBe(`Beta ${stamp}`);
  });

  it("refuses the other customer, both ways", async () => {
    refused(await clients.alfa.rpc("portal_customer", { p_customer_id: ids.beta }), "alfa asks beta");
    refused(await clients.beta.rpc("portal_customer", { p_customer_id: ids.alfa }), "beta asks alfa");
    expect(await as(clients.alfa, () => denied(readPortalCustomer(ids.beta)))).toBe(true);
  });
});

describe.runIf(local)("invoices", () => {
  it("lists only what was sent: no concept, no definitive invoice that never went out, nothing of another customer", async () => {
    const { data, error } = await clients.alfa.rpc("portal_invoices", { p_customer_id: ids.alfa });
    expect(error).toBeNull();
    expect(data!.map((row) => row.id).sort()).toEqual([docs.alfaPartlyPaid, docs.alfaRefunded].sort());

    const beta = await clients.beta.rpc("portal_invoices", { p_customer_id: ids.beta });
    expect(beta.data!.map((row) => row.id)).toEqual([docs.betaInvoice]);
  });

  it("returns only the named columns and keys", async () => {
    const { data } = await clients.alfa.rpc("portal_invoice", { p_customer_id: ids.alfa, p_invoice_id: docs.alfaRefunded });
    const row = data![0]!;
    expect(Object.keys(row).sort()).toEqual(
      ["addressed_to", "billing_period_end", "billing_period_start", "credit_notes", "due_date", "id", "issue_date", "lines", "number", "payment_reference", "payments", "refunds", "status"].sort(),
    );
    expect(Object.keys(row.addressed_to as object).sort()).toEqual(["city", "company_name", "contact_name", "country", "kvk_number", "postal_code", "street", "vat_number"]);
    expect(Object.keys((row.lines as object[])[0]!).sort()).toEqual(["description", "position", "quantity_hundredths", "unit_price_cents", "vat_rate"]);
    expect(Object.keys((row.payments as object[])[0]!).sort()).toEqual(["amount_cents", "method", "paid_at", "source"]);
    expect(Object.keys((row.credit_notes as object[])[0]!).sort()).toEqual(["created_at", "id", "issue_date", "number", "subtotal_cents", "total_cents", "vat_cents"]);
    expect(Object.keys((row.refunds as object[])[0]!).sort()).toEqual(["amount_cents", "created_at", "credit_note_id", "status"]);
    expect(JSON.stringify(data)).not.toMatch(/INTERNAL|tr_|document_path|invoice-documents/);
  });

  it("derives where each invoice stands from the ledger: part paid, and paid-credited-refunded", async () => {
    const invoices = await as(clients.alfa, () => readPortalInvoices(ids.alfa));
    const views = new Map(invoices.map((invoice) => [invoice.id, portalInvoiceView(invoice, today)]));

    const partly = views.get(docs.alfaPartlyPaid)!;
    expect(partly.ledger).toMatchObject({ totalCents: 121000, paidCents: 21000, outstandingCents: 100000 });
    expect(partly.openCents).toBe(100000);
    expect(["partially_paid", "overdue"]).toContain(partly.state);

    const refunded = views.get(docs.alfaRefunded)!;
    expect(refunded.ledger).toMatchObject({ totalCents: 60500, creditedCents: 12100, dueCents: 48400, paidCents: 60500, overpaidCents: 12100, refundedCents: 12100 });
    expect(refunded.openCents).toBe(0);
    expect(refunded.state).toBe("paid");
    expect(refunded.creditNotes).toEqual([expect.objectContaining({ id: docs.alfaCreditNote, totalCents: 12100, state: "processed", refundedCents: 12100 })]);
  });

  it("refuses another customer's invoice, a concept, an unsent one and an unknown id with the same answer", async () => {
    for (const [label, client, customer, invoice] of [
      ["alfa asks beta's invoice", clients.alfa, ids.alfa, docs.betaInvoice],
      ["alfa names beta", clients.alfa, ids.beta, docs.betaInvoice],
      ["beta asks alfa's invoice", clients.beta, ids.beta, docs.alfaPartlyPaid],
      ["concept", clients.alfa, ids.alfa, docs.alfaConcept],
      ["unsent", clients.alfa, ids.alfa, docs.alfaIssuedOnly],
      ["unknown", clients.alfa, ids.alfa, crypto.randomUUID()],
    ] as const) {
      refused(await client.rpc("portal_invoice", { p_customer_id: customer, p_invoice_id: invoice }), label);
    }
    expect(await as(clients.alfa, () => denied(readPortalInvoice(ids.alfa, "not-a-uuid")))).toBe(true);
  });
});

describe.runIf(local)("quotes", () => {
  it("shows sent quotes with their document only: no concept, no unsent revision, no legacy quote", async () => {
    const { data } = await clients.alfa.rpc("portal_quotes", { p_customer_id: ids.alfa });
    expect(data!.map((row) => row.id)).toEqual([docs.alfaQuoteV1]);
    expect(data![0]!.superseded_by_quote_id).toBeNull();
    for (const id of [docs.alfaQuoteConcept, docs.alfaQuoteV2, docs.alfaLegacyQuote, docs.betaQuote]) {
      refused(await clients.alfa.rpc("portal_quote", { p_customer_id: ids.alfa, p_quote_id: id }), `quote ${id}`);
      refused(await clients.alfa.rpc("portal_document", { p_customer_id: ids.alfa, p_kind: "quote", p_id: id }), `quote document ${id}`);
    }
  });

  it("marks a quote replaced once its new version was sent, and links the versions", async () => {
    const sent = await sendQuoteToCustomer(docs.alfaQuoteV2);
    expect(sent.ok).toBe(true);

    const quotes = await as(clients.alfa, () => readPortalQuotes(ids.alfa));
    const v1 = quotes.find((quote) => quote.id === docs.alfaQuoteV1)!;
    const v2 = quotes.find((quote) => quote.id === docs.alfaQuoteV2)!;
    expect(v1.supersededBy?.id).toBe(docs.alfaQuoteV2);
    expect(v2.supersedes?.id).toBe(docs.alfaQuoteV1);

    const detail = await as(clients.alfa, () => readPortalQuote(ids.alfa, docs.alfaQuoteV1));
    expect(detail.versions.map((version) => version.id)).toEqual([docs.alfaQuoteV1, docs.alfaQuoteV2]);
    expect(detail.terms).toEqual({ edition: expect.any(String), publishedOn: expect.any(String) });
  });

  it("returns the named columns only, never the intro or the notes", async () => {
    const { data } = await clients.alfa.rpc("portal_quote", { p_customer_id: ids.alfa, p_quote_id: docs.alfaQuoteV2 });
    expect(Object.keys(data![0]!).sort()).toEqual(
      [
        "id", "issue_date", "lines", "number", "sent_at", "status", "subject", "superseded_by_number", "superseded_by_quote_id",
        "superseded_on", "supersedes_number", "supersedes_quote_id", "terms_edition", "terms_published_on", "valid_until", "versions",
      ].sort(),
    );
    expect(JSON.stringify(data)).not.toMatch(/INTERNAL|document_path/);
    const list = await clients.alfa.rpc("portal_quotes", { p_customer_id: ids.alfa });
    expect(JSON.stringify(list.data)).not.toContain("INTERNAL");
  });

  it("refuses the other customer's quote both ways", async () => {
    refused(await clients.beta.rpc("portal_quote", { p_customer_id: ids.beta, p_quote_id: docs.alfaQuoteV1 }), "beta asks alfa");
    refused(await clients.alfa.rpc("portal_quote", { p_customer_id: ids.alfa, p_quote_id: docs.betaQuote }), "alfa asks beta");
    const beta = await clients.beta.rpc("portal_quotes", { p_customer_id: ids.beta });
    expect(beta.data!.map((row) => row.id)).toEqual([docs.betaQuote]);
  });
});

describe.runIf(local)("services", () => {
  it("shows the services past the concept stage, with the safe fields only", async () => {
    const { data } = await clients.alfa.rpc("portal_services", { p_customer_id: ids.alfa });
    expect(data!.map((row) => row.id)).toEqual([docs.alfaService]);
    expect(Object.keys(data![0]!).sort()).toEqual(
      [
        "agreements", "amount_cents", "billed_period_starts", "cancellation_requested_on", "collects_by_direct_debit", "ends_on",
        "id", "last_term_amount_cents", "name", "price_changes", "starts_on", "status", "vat_rate",
      ].sort(),
    );
    expect(Object.keys((data![0]!.agreements as object[])[0]!).sort()).toEqual(
      ["accepted_on", "effective_from", "has_special_terms", "id", "minimum_term_months", "notice_months", "proration_rule", "sequence", "source_kind", "terms_edition", "terms_published_on"].sort(),
    );
    expect(Object.keys((data![0]!.price_changes as object[])[0]!).sort()).toEqual(["applied", "effective_from", "new_amount_cents", "old_amount_cents"]);
    expect(JSON.stringify(data)).not.toMatch(/INTERNAL|sub_|claim|lifecycle_problem|mollie/);
  });

  it("resolves the price and the agreement the admin's helpers resolve", async () => {
    const [found] = await as(clients.alfa, () => readPortalServices(ids.alfa));
    const view = portalServiceView(found!, today);
    expect(view.service.collectsByDirectDebit).toBe(true);
    /* The withdrawn change counts nowhere; the announced one is ahead. */
    expect(found!.priceChanges.map((change) => change.effectiveFrom)).toEqual(["2099-01-15"]);
    expect(view.currentNetCents).toBe(2500);
    expect(view.scheduledChange).toEqual({ effectiveFrom: "2099-01-15", newNetCents: 3000, newGrossCents: 3630 });

    /* While the change is still being planned -- withdrawable, the provider not told -- the customer sees nothing of it. */
    await service.from("recurring_price_changes").update({ provider_updated_at: null }).eq("recurring_service_id", docs.alfaService).eq("effective_from", "2099-01-15");
    const [planning] = await as(clients.alfa, () => readPortalServices(ids.alfa));
    expect(planning!.priceChanges).toEqual([]);
    expect(portalServiceView(planning!, today).scheduledChange).toBeUndefined();
    await service.from("recurring_price_changes").update({ provider_updated_at: new Date().toISOString() }).eq("recurring_service_id", docs.alfaService).eq("effective_from", "2099-01-15");
    expect(view.agreement).toMatchObject({ noticeMonths: 2, minimumTermMonths: 12, source: { kind: "accepted_offer", acceptedOn: "2026-09-30" } });
    expect(view.hasSpecialTerms).toBe(true);
    expect(view.minimumTermEndsOn).toBe("2027-09-14");
    /* Nothing billed yet and the start date is behind us: the schedule's date is past, so the portal shows none. */
    expect(view.next).toBeUndefined();
  });

  it("gives each customer their own services only", async () => {
    const beta = await clients.beta.rpc("portal_services", { p_customer_id: ids.beta });
    expect(beta.data!.map((row) => row.id)).toEqual([docs.betaService]);
    expect(beta.data![0]!.collects_by_direct_debit).toBe(false);
    refused(await clients.beta.rpc("portal_services", { p_customer_id: ids.alfa }), "beta asks alfa");
  });
});

describe.runIf(local)("documents", () => {
  it("a member downloads their own PDFs, checked against the stored hash", async () => {
    for (const [kind, id, path] of [
      ["invoice", docs.alfaPartlyPaid, paths.alfaInvoice],
      ["credit_note", docs.alfaCreditNote, paths.alfaCreditNote],
      ["quote", docs.alfaQuoteV1, paths.alfaQuote],
    ] as const) {
      const document = await as(clients.alfa, () => readPortalDocumentFile({ customerId: ids.alfa }, kind, id));
      expect(document.pdf.subarray(0, 5).toString()).toBe("%PDF-");
      const table = kind === "invoice" ? "invoices" : kind === "quote" ? "quotes" : "credit_notes";
      expect(sha256Hex(document.pdf)).toBe(await column<string>(table, id, "document_sha256"));
      /* The same bytes the bucket holds -- read here on the service client, since the member has no read on it. */
      expect((await download(service, path))?.equals(document.pdf)).toBe(true);
    }
  });

  it("the exact same object path is refused to another customer's member, a stranger, anon and the revoked", async () => {
    for (const [label, client] of [
      ["beta", clients.beta],
      ["stranger", clients.stranger],
      ["anon", clients.anon],
      ["revoked", clients.revoked],
    ] as const) {
      for (const path of [paths.alfaInvoice, paths.alfaCreditNote, paths.alfaQuote]) {
        expect(await download(client, path), `${label} ${path}`).toBeNull();
      }
    }
  });

  it("not even the owner reads the bucket directly: no download, no listing, no signed URL that could outlive access", async () => {
    for (const path of [paths.alfaInvoice, paths.alfaCreditNote, paths.alfaQuote]) {
      expect(await download(clients.alfa, path), path).toBeNull();
      const signed = await clients.alfa.storage.from(invoiceDocumentBucket).createSignedUrl(path, 3600);
      expect(signed.data?.signedUrl ?? null, path).toBeNull();
    }
    const year = paths.alfaInvoice.split("/")[0]!;
    const { data } = await clients.alfa.storage.from(invoiceDocumentBucket).list(year, { limit: 1000 });
    expect(data ?? []).toEqual([]);
  });

  it("an invoice that was never sent has a stored file the customer cannot read", async () => {
    expect(await download(clients.alfa, paths.alfaIssuedOnly)).toBeNull();
    refused(await clients.alfa.rpc("portal_document", { p_customer_id: ids.alfa, p_kind: "invoice", p_id: docs.alfaIssuedOnly }), "unsent");
  });

  it("a member lists nothing in the bucket but their own visible documents", async () => {
    const year = paths.alfaInvoice.split("/")[0]!;
    const { data } = await clients.beta.storage.from(invoiceDocumentBucket).list(year, { limit: 1000 });
    const names = (data ?? []).map((item) => `${year}/${item.name}`);
    expect(names).not.toContain(paths.alfaInvoice);
    expect(names).not.toContain(paths.alfaQuote);
  });

  it("refuses a foreign id, a wrong kind and a malformed kind with the same answer", async () => {
    refused(await clients.beta.rpc("portal_document", { p_customer_id: ids.beta, p_kind: "invoice", p_id: docs.alfaPartlyPaid }), "foreign");
    refused(await clients.alfa.rpc("portal_document", { p_customer_id: ids.alfa, p_kind: "quote", p_id: docs.alfaPartlyPaid }), "wrong kind");
    refused(await clients.alfa.rpc("portal_document", { p_customer_id: ids.alfa, p_kind: "bogus", p_id: docs.alfaPartlyPaid }), "bogus kind");
  });

  it("the download route answers 200 with the PDF for the owner and the same 404 for everything else", async () => {
    const call = (kind: string, id: string) => documentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ kind, id }) });

    jar.clear();
    visitor = clients.alfa;
    const ok = await call("invoice", docs.alfaPartlyPaid);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(ok.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await ok.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");

    for (const [kind, id] of [
      ["invoice", docs.betaInvoice],
      ["invoice", docs.alfaIssuedOnly],
      ["quote", docs.alfaLegacyQuote],
      ["quote", docs.alfaQuoteConcept],
      ["invoice", crypto.randomUUID()],
      ["invoice", "not-a-uuid"],
      ["bogus", docs.alfaPartlyPaid],
    ] as const) {
      expect((await call(kind, id)).status, `${kind} ${id}`).toBe(404);
    }

    visitor = clients.anon;
    expect((await call("invoice", docs.alfaPartlyPaid)).status).toBe(404);
    visitor = clients.stranger;
    expect((await call("invoice", docs.alfaPartlyPaid)).status).toBe(404);
  });
});

describe.runIf(local)("a member of two customers", () => {
  it("reads each customer only when naming it, and never anything of a third", async () => {
    const alfa = await clients.multi.rpc("portal_invoices", { p_customer_id: ids.alfa });
    const beta = await clients.multi.rpc("portal_invoices", { p_customer_id: ids.beta });
    expect(alfa.data!.map((row) => row.id).sort()).toEqual([docs.alfaPartlyPaid, docs.alfaRefunded].sort());
    expect(beta.data!.map((row) => row.id)).toEqual([docs.betaInvoice]);
    refused(await clients.multi.rpc("portal_invoice", { p_customer_id: ids.beta, p_invoice_id: docs.alfaPartlyPaid }), "alfa's invoice named under beta");
    refused(await clients.multi.rpc("portal_customer", { p_customer_id: crypto.randomUUID() }), "a third customer");
  });

  it("switches every read with the customer it picked, and a forged choice falls back to its own", async () => {
    jar.clear();
    visitor = clients.multi;

    const first = await resolvePortalAccess(clients.multi, undefined);
    expect(first.state).toBe("member");
    if (first.state !== "member") return;
    expect(first.member.memberships.map((item) => item.customerId).sort()).toEqual([ids.alfa, ids.beta].sort());

    const form = new FormData();
    form.set("customerId", ids.beta);
    await expect(selectCustomerAction(form)).rejects.toThrow(Redirected);
    expect(jar.get(portalCustomerCookie)).toBe(ids.beta);

    const onBeta = await resolvePortalAccess(clients.multi, jar.get(portalCustomerCookie));
    if (onBeta.state !== "member") throw new Error("expected member");
    expect(onBeta.member.current.customerId).toBe(ids.beta);
    const betaInvoices = await readPortalInvoices(onBeta.member.current.customerId);
    const betaQuotes = await readPortalQuotes(onBeta.member.current.customerId);
    const betaServices = await readPortalServices(onBeta.member.current.customerId);
    expect(betaInvoices.map((item) => item.id)).toEqual([docs.betaInvoice]);
    expect(betaQuotes.map((item) => item.id)).toEqual([docs.betaQuote]);
    expect(betaServices.map((item) => item.id)).toEqual([docs.betaService]);

    form.set("customerId", ids.alfa);
    await expect(selectCustomerAction(form)).rejects.toThrow(Redirected);
    const onAlfa = await resolvePortalAccess(clients.multi, jar.get(portalCustomerCookie));
    if (onAlfa.state !== "member") throw new Error("expected member");
    expect(onAlfa.member.current.customerId).toBe(ids.alfa);
    const alfaInvoices = await readPortalInvoices(onAlfa.member.current.customerId);
    expect(alfaInvoices.map((item) => item.id).sort()).toEqual([docs.alfaPartlyPaid, docs.alfaRefunded].sort());
    expect(alfaInvoices.some((item) => item.id === docs.betaInvoice)).toBe(false);

    /* A cookie naming a customer this user does not belong to is ignored, and the database would refuse it anyway. */
    form.set("customerId", crypto.randomUUID());
    await expect(selectCustomerAction(form)).rejects.toThrow(Redirected);
    expect(jar.get(portalCustomerCookie)).toBe(ids.alfa);
    const forged = await resolvePortalAccess(clients.multi, crypto.randomUUID());
    if (forged.state !== "member") throw new Error("expected member");
    expect([ids.alfa, ids.beta]).toContain(forged.member.current.customerId);

    /* The single-customer member who forges the multi member's other customer gets their own. */
    const alfaOnly = await resolvePortalAccess(clients.alfa, ids.beta);
    if (alfaOnly.state !== "member") throw new Error("expected member");
    expect(alfaOnly.member.current.customerId).toBe(ids.alfa);
    expect(await as(clients.alfa, () => denied(readPortalInvoices(ids.beta)))).toBe(true);
  });

  it("downloads each customer's document, and loses one customer's documents when that membership ends", async () => {
    expect(await served(clients.multi, ids.alfa, "invoice", docs.alfaPartlyPaid)).not.toBeNull();
    await service.from("customer_users").update({ revoked_at: new Date().toISOString() }).eq("user_id", ids.multiUser).eq("customer_id", ids.alfa);
    expect(await served(clients.multi, ids.alfa, "invoice", docs.alfaPartlyPaid)).toBeNull();
    refused(await clients.multi.rpc("portal_invoices", { p_customer_id: ids.alfa }), "after alfa revoked");
    const beta = await clients.multi.rpc("portal_invoices", { p_customer_id: ids.beta });
    expect(beta.error).toBeNull();
    await service.from("customer_users").update({ revoked_at: null }).eq("user_id", ids.multiUser).eq("customer_id", ids.alfa);
  });
});

describe.runIf(local)("what the administration keeps to itself", () => {
  it("appears in no answer of any portal read, for any customer", async () => {
    const answers: unknown[] = [];
    for (const [client, customer] of [
      [clients.alfa, ids.alfa],
      [clients.beta, ids.beta],
    ] as const) {
      for (const read of reads()) answers.push((await read.call(client, customer)).data);
    }
    answers.push((await clients.alfa.rpc("portal_invoice", { p_customer_id: ids.alfa, p_invoice_id: docs.alfaRefunded })).data);
    answers.push((await clients.alfa.rpc("portal_quote", { p_customer_id: ids.alfa, p_quote_id: docs.alfaQuoteV1 })).data);
    const text = JSON.stringify(answers);
    expect(text.length).toBeGreaterThan(1000);
    for (const secret of secrets) expect(text, secret).not.toContain(secret);
  });
});

describe.runIf(local)("the function definitions in the database", () => {
  it("lets authenticated but not anon or public execute the portal reads", async () => {
    const statement = `
      select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_exec,
             has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
             p.prosecdef, p.proconfig::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('portal_customer','portal_invoices','portal_invoice','portal_quotes','portal_quote','portal_services','portal_document')
      order by 1`;
    const out = execFileSync("docker", ["exec", "supabase_db_portfolio-site", "psql", "-U", "postgres", "-At", "-F", "|", "-c", statement], { encoding: "utf8" });
    const rows = out.trim().split("\n").map((line) => line.split("|"));
    expect(rows).toHaveLength(7);
    for (const [name, anonExec, authExec, definer, config] of rows) {
      expect(anonExec, name).toBe("f");
      expect(authExec, name).toBe("t");
      expect(definer, name).toBe("t");
      expect(config, name).toMatch(/search_path=(""|\\"\\")/);
    }
  });

  it("keeps the private helpers away from client roles, the retired storage check included", async () => {
    const statement = `
      select p.proname, has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname in ('portal_require_customer','portal_invoice_rows','portal_quote_rows','portal_can_read_document')
      order by 1`;
    const out = execFileSync("docker", ["exec", "supabase_db_portfolio-site", "psql", "-U", "postgres", "-At", "-F", "|", "-c", statement], { encoding: "utf8" });
    expect(out.trim().split("\n")).toEqual([
      "portal_can_read_document|f|f",
      "portal_invoice_rows|f|f",
      "portal_quote_rows|f|f",
      "portal_require_customer|f|f",
    ]);
  });

  it("adds no policy for customers on any business table", async () => {
    const statement = `
      select tablename, policyname from pg_policies
      where schemaname = 'public'
        and tablename in ('customers','invoices','invoice_lines','quotes','quote_lines','payments','credit_notes','credit_note_lines','refunds','recurring_services','recurring_price_changes','recurring_service_agreements')
        and coalesce(qual, with_check) not like '%is_admin()%'`;
    const out = execFileSync("docker", ["exec", "supabase_db_portfolio-site", "psql", "-U", "postgres", "-At", "-c", statement], { encoding: "utf8" });
    expect(out.trim()).toBe("");
  });
});
