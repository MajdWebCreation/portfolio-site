import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The customer portal V1, end to end, as one customer's first weeks:
 *
 *   invitation -> password -> sign-in -> own details -> a request with files
 *   -> the quote made for it -> the decision -> the invoice -> a payment
 *   through Mollie and its webhook -> direct debit through EUR 0.01
 *
 * and then, with the same records, one systematic pass of another customer's
 * member reaching for every id this customer has.
 *
 * Each step leans on the one before. The domains have their own, deeper
 * suites; this one exists so that a change that breaks a connection between
 * them -- membership to customer, request to quote, quote to decision,
 * invoice to payment -- fails here, in the order a customer meets them.
 *
 * Real Postgres, Auth and Storage (`npx supabase start`, Node 22); Mollie
 * and the mail provider are stubs.
 *
 *   SUPABASE_LOCAL_URL=http://127.0.0.1:54321 \
 *   SUPABASE_LOCAL_SERVICE_KEY=… SUPABASE_LOCAL_ANON_KEY=… npx vitest run …
 */
const url = process.env.SUPABASE_LOCAL_URL ?? "";
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? "";
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? "";
const loopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const local = loopback.test(url) && Boolean(serviceKey) && Boolean(anonKey);

process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonKey;
process.env.SUPABASE_SECRET_KEY = serviceKey;
process.env.MOLLIE_API_KEY = "test_v1_acceptance_stub";
process.env.NEXT_PUBLIC_SITE_URL = "https://ymcreations.test";
process.env.PAYMENT_RETURN_SECRET = "v1-acceptance-test-secret-0123456789abcdef";
process.env.CONTACT_TO_EMAIL = "intern@ymcreations.test";

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

const deliverEmail = vi.fn();
vi.mock("@/lib/admin/communications/provider", () => ({ deliverEmail: (...args: unknown[]) => deliverEmail(...args) }));

// ------------------------------------------------------------- Mollie stub

const runId = Date.now().toString(36);
type StubPayment = { id: string; status: "paid"; amount: { currency: "EUR"; value: string }; description: string; method: string; paidAt: string; sequenceType: string; customerId?: string; mandateId?: string };
type StubLink = { id: string; amountCents: number; sequenceType: string; href: string; archived: boolean; paidAt: string | null; customerId?: string; payments: StubPayment[] };
const mollie = {
  links: new Map<string, StubLink>(),
  byKey: new Map<string, string>(),
  customers: new Map<string, string>(),
  mandates: new Map<string, { id: string; status: "valid" | "pending" | "invalid"; method: string }[]>(),
  counter: 0,
};
const linkView = (link: StubLink) => ({
  id: link.id,
  archived: link.archived,
  paidAt: link.paidAt,
  expiresAt: null,
  amount: { currency: "EUR", value: (link.amountCents / 100).toFixed(2) },
  _links: { paymentLink: { href: link.href } },
});
vi.mock("@/lib/mollie/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/mollie/client")>();
  return {
    ...original,
    createPaymentLink: async (input: { amountCents: number; sequenceType: string; idempotencyKey: string; customerId?: string }) => {
      const known = mollie.byKey.get(input.idempotencyKey);
      if (known) return linkView(mollie.links.get(known)!);
      mollie.counter += 1;
      const id = `pl_v1${runId}${mollie.counter}`;
      const link: StubLink = { id, amountCents: input.amountCents, sequenceType: input.sequenceType, href: `https://mollie.test/pay/${id}`, archived: false, paidAt: null, payments: [], ...(input.customerId ? { customerId: input.customerId } : {}) };
      mollie.links.set(id, link);
      mollie.byKey.set(input.idempotencyKey, id);
      return linkView(link);
    },
    getPaymentLink: async (id: string) => {
      const link = mollie.links.get(id);
      if (!link) throw new original.MollieError(404, "Not found");
      return linkView(link);
    },
    archivePaymentLink: async (id: string) => {
      const link = mollie.links.get(id);
      if (!link) throw new original.MollieError(404, "Not found");
      link.archived = true;
      return linkView(link);
    },
    listPaymentLinkPayments: async (id: string) => mollie.links.get(id)?.payments ?? [],
    getPayment: async (id: string) => {
      for (const link of mollie.links.values()) {
        const found = link.payments.find((payment) => payment.id === id);
        if (found) return found;
      }
      throw new original.MollieError(404, "Not found");
    },
    createCustomer: async (input: { idempotencyKey: string }) => {
      const known = mollie.customers.get(input.idempotencyKey);
      if (known) return { id: known };
      mollie.counter += 1;
      const id = `cst_v1${runId}${mollie.counter}`;
      mollie.customers.set(input.idempotencyKey, id);
      return { id };
    },
    listMandates: async (customerId: string) => mollie.mandates.get(customerId) ?? [],
  };
});

/** The customer paying at Mollie: the link produces a paid payment, as Mollie's checkout does. */
function payAtMollie(href: string, extra: Partial<StubPayment> = {}): StubLink {
  const link = [...mollie.links.values()].find((candidate) => candidate.href === href);
  if (!link) throw new Error(`no stub link at ${href}`);
  mollie.counter += 1;
  link.paidAt = new Date().toISOString();
  link.payments.push({
    id: `tr_v1${runId}${mollie.counter}`,
    status: "paid",
    amount: { currency: "EUR", value: (link.amountCents / 100).toFixed(2) },
    description: "Betaling",
    method: link.sequenceType === "first" ? "ideal" : "ideal",
    paidAt: link.paidAt,
    sequenceType: link.sequenceType,
    ...extra,
  });
  return link;
}

// -------------------------------------------------- sessions and boundary

let admin: SupabaseClient<Database>;
let visitor: SupabaseClient<Database>;
let service: SupabaseClient<Database>;
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => admin,
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin: async () => ({ userId: "00000000-0000-4000-8000-000000000000", email: null, displayName: null }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => visitor }));

const { invitePortalMember, revokePortalMember } = await import("@/lib/admin/portal-members/actions");
const auth = await import("@/lib/portal/auth-actions");
const { portalCustomerCookie } = await import("@/lib/portal/auth");
const { saveProfileAction } = await import("@/lib/portal/profile/actions");
const { readPortalProfile } = await import("@/lib/portal/profile/read");
const { resolveCustomerRecipient } = await import("@/lib/admin/communications/recipient");
const { createRequestAction, registerAttachmentAction } = await import("@/lib/portal/requests/actions");
const { readPortalRequest } = await import("@/lib/portal/requests/read");
const { setRequestStatus, linkRequest } = await import("@/lib/admin/requests/actions");
const { sendQuoteToCustomer, sendInvoiceToCustomer } = await import("@/lib/admin/documents/send");
const { decideQuoteAction } = await import("@/lib/portal/quotes/actions");
const { readPortalQuote, readPortalQuoteDecision } = await import("@/lib/portal/quotes/read");
const { portalQuoteState } = await import("@/lib/portal/quotes/model");
const { finalizeInvoice } = await import("@/lib/admin/invoices/finalize");
const { createManualCreditNote } = await import("@/lib/admin/credit-notes/actions");
const { recordManualPayment } = await import("@/lib/payments/payment-actions");
const { readPortalInvoice } = await import("@/lib/portal/invoices/read");
const { portalInvoiceView } = await import("@/lib/portal/invoices/model");
const { readPortalPaymentContext } = await import("@/lib/portal/payments/read");
const { invoicePaymentBlock } = await import("@/lib/portal/payments/model");
const { readPortalServices } = await import("@/lib/portal/services/read");
const { payInvoiceAction, activateDirectDebitAction } = await import("@/lib/portal/payment-actions");
const { POST: mollieWebhook } = await import("@/app/api/mollie/webhook/route");
const { GET: documentRoute } = await import("@/app/portaal/documenten/[kind]/[id]/route");
const { GET: attachmentRoute } = await import("@/app/portaal/(shell)/verzoeken/bijlagen/[attachmentId]/route");
const { PortalDenied } = await import("@/lib/portal/rpc");
const { resetRateLimits } = await import("@/lib/payments/rate-limit");

type Db = SupabaseClient<Database>;
const stamp = Date.now();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
/* Quotes and invoices here are numbered in a year of their own: other files assert that this year's counter moved exactly once. */
const issueDate = "2032-02-02";
const password = "v1-acceptatie-wachtwoord";
const mail = (label: string) => `v1-${label}-${stamp}@example.test`;

const A = { customer: "", contact: mail("contact-a"), billing: mail("facturen-a"), member: mail("klant-a"), userId: "" };
const B = { customer: "", member: mail("klant-b"), userId: "" };
const AB = { member: mail("klant-ab"), userId: "" };
const made = { users: [] as string[], adminUser: "" };
/* What customer A ends up holding, for the cross-tenant pass. */
const own = { request: "", attachment: "", quote: "", rejectedQuote: "", decisionQuote: "", invoice: "", service: "", project: "" };

const fresh = (): Db => createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Redirected) return error.to;
    throw error;
  }
  throw new Error("expected a redirect");
}

async function denied(run: Promise<unknown>): Promise<boolean> {
  try {
    await run;
    return false;
  } catch (error) {
    if (error instanceof PortalDenied) return true;
    throw error;
  }
}

/** The session a browser holds, acting for the customer its cookie names. */
function as(client: Db, customerId?: string) {
  visitor = client;
  if (customerId) jar.set(portalCustomerCookie, customerId);
  else jar.delete(portalCustomerCookie);
}

async function signedIn(email: string, secret = password): Promise<Db> {
  const client = fresh();
  const { error } = await client.auth.signInWithPassword({ email, password: secret });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

async function customer(name: string, email: string): Promise<string> {
  const { data, error } = await service
    .from("customers")
    .insert({ company_name: `${name} ${stamp}`, contact_name: `Contact ${name}`, email, street: "Straat 1", postal_code: "1011 AA", city: "Amsterdam", country: "Nederland" })
    .select("id")
    .single();
  if (error) throw new Error(`customer ${name}: ${error.message}`);
  return data!.id;
}

function lastToken(to: string): { tokenHash: string; type: string } {
  const sent = deliverEmail.mock.calls.map(([email]) => email as { to: string; text: string }).filter((email) => email.to === to).at(-1);
  const match = sent?.text.match(/token_hash=([^&\s]+)&type=([a-z]+)/);
  if (!match) throw new Error(`no token mailed to ${to}`);
  return { tokenHash: match[1]!, type: match[2]! };
}

/** Invitation mail -> set password -> sign in, through the portal's own actions. */
async function onboard(customerId: string, email: string): Promise<Db> {
  const invited = await invitePortalMember(customerId, email);
  if (!invited.ok) throw new Error(`invite: ${invited.error}`);
  const token = lastToken(email);
  as(fresh());
  const set = await redirectOf(() => auth.setPasswordWithTokenAction({ error: null }, form({ token_hash: token.tokenHash, type: token.type, password, confirmation: password })));
  expect(set).toMatch(/^\/portaal/);
  const browser = fresh();
  as(browser);
  expect(await redirectOf(() => auth.portalSignInAction({ error: null }, form({ email, password })))).toMatch(/^\/portaal/);
  return browser;
}

async function concept(table: "quotes" | "invoices", customerId: string, unitPriceCents: number): Promise<string> {
  const seed = Math.random().toString(36).slice(-6).toUpperCase();
  const common = {
    number_value: `CONCEPT-${seed}`, number_provisional: true, status: "draft", customer_id: customerId,
    customer_company_name: "K", customer_contact_name: "C", customer_email: mail(`doc-${seed.toLowerCase()}`),
    customer_street: "Straat 1", customer_postal_code: "1011 AA", customer_city: "Amsterdam", customer_country: "Nederland", issue_date: issueDate,
  };
  const row = table === "quotes"
    ? await service.from("quotes").insert({ ...common, valid_until: "2099-12-31", subject: "Nieuwe website" }).select("id").single()
    : await service.from("invoices").insert({ ...common, due_date: "2099-12-31", payment_reference: "", notes: "" }).select("id").single();
  if (row.error) throw new Error(`${table}: ${row.error.message}`);
  const lines = [{ description: "Website", quantityHundredths: 100, unitPriceCents, vatRate: 21 }] as never;
  const saved = table === "quotes"
    ? await service.rpc("save_quote_lines", { p_quote_id: row.data!.id, p_lines: lines })
    : await service.rpc("save_invoice_lines", { p_invoice_id: row.data!.id, p_lines: lines });
  if (saved.error) throw new Error(`lines: ${saved.error.message}`);
  return row.data!.id;
}

async function webhook(id: string): Promise<number> {
  const response = await mollieWebhook(new Request("http://localhost/api/mollie/webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.0.0.1" }, body: `id=${id}` }));
  return response.status;
}

const sha256 = async (response: Response) => createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");

beforeAll(async () => {
  if (!local) return;
  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
  deliverEmail.mockResolvedValue({ sent: true, sentAt: new Date().toISOString(), messageId: "local" });

  const adminUser = await service.auth.admin.createUser({ email: mail("admin"), password, email_confirm: true });
  if (adminUser.error) throw new Error(adminUser.error.message);
  made.adminUser = adminUser.data.user!.id;
  await service.from("admin_profiles").insert({ user_id: made.adminUser, display_name: "V1 acceptance" });
  admin = await signedIn(mail("admin"));

  A.customer = await customer("Alfa", A.contact);
  B.customer = await customer("Beta", mail("contact-b"));
}, 120_000);

afterAll(async () => {
  if (!local || !service) return;
  const { data } = await service.from("customer_users").select("user_id").in("customer_id", [A.customer, B.customer].filter(Boolean));
  for (const id of new Set([...(data ?? []).map((row) => row.user_id), made.adminUser].filter(Boolean))) await service.auth.admin.deleteUser(id);
}, 120_000);

describe.runIf(local).sequential("a customer's first weeks in the portal", () => {
  let browser: Db;

  it("A. is invited, sets a password, signs in, signs out and in again", async () => {
    browser = await onboard(A.customer, A.member);
    const { data } = await service.from("customer_users").select("user_id, accepted_at, revoked_at").eq("customer_id", A.customer).single();
    expect(data!.accepted_at).not.toBeNull();
    expect(data!.revoked_at).toBeNull();
    A.userId = data!.user_id;

    as(browser);
    await expect(auth.portalSignOutAction()).rejects.toThrow("redirect:/portaal/inloggen");
    browser = fresh();
    as(browser);
    expect(await redirectOf(() => auth.portalSignInAction({ error: null }, form({ email: A.member, password })))).toMatch(/^\/portaal/);
  }, 60_000);

  it("B. edits their details with a billing address; the login stays, quotes go to the contact, invoices to billing", async () => {
    as(browser);
    const profile = await readPortalProfile(A.customer);
    const saved = await saveProfileAction({ status: "idle" }, form({ ...profile.fields, customerId: A.customer, version: profile.version, phone: "020 123 4567", billingEmail: A.billing }));
    expect(saved.status).toBe("saved");
    expect((await readPortalProfile(A.customer)).fields).toMatchObject({ billingEmail: A.billing, phone: "020 123 4567", email: A.contact });

    const login = await service.auth.admin.getUserById(A.userId);
    expect(login.data.user!.email).toBe(A.member);
    const financial = await resolveCustomerRecipient(service, A.customer, "financial");
    const general = await resolveCustomerRecipient(service, A.customer, "general");
    expect(financial.ok && financial.recipient.email).toBe(A.billing);
    expect(general.ok && general.recipient.email).toBe(A.contact);
  }, 60_000);

  it("C. submits one request with files -- a failed one retried -- and follows the status YM Creations sets", async () => {
    as(browser);
    const submissionId = crypto.randomUUID();
    const fields = { customerId: A.customer, submissionId, category: "website_change", subject: "Nieuwe pagina", description: "Graag een pagina over onze diensten." };
    const created = await createRequestAction({ status: "idle" }, form(fields));
    /* Whole objects in these assertions: a failure here has to say what the action answered. */
    expect(created).toMatchObject({ status: "created" });
    /* The same intention submitted again stays one request. */
    expect(await createRequestAction({ status: "idle" }, form(fields))).toEqual(created);
    own.request = created.status === "created" ? created.requestId : "";

    const upload = async (bytes: Uint8Array, mimeType: string, fileName: string) => {
      const slot = await browser.rpc("portal_reserve_request_upload", { p_customer_id: A.customer, p_request_id: own.request });
      if (slot.error) throw new Error(slot.error.message);
      const path = slot.data![0]!.storage_path;
      const stored = await browser.storage.from("request-attachments").upload(path, bytes, { contentType: mimeType, upsert: false });
      if (stored.error) throw new Error(stored.error.message);
      as(browser);
      return registerAttachmentAction({ customerId: A.customer, requestId: own.request, storagePath: path, fileName, mimeType });
    };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(200).fill(1)]);
    const pdf = new TextEncoder().encode("%PDF-1.4\n%v1\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

    const first = await upload(png, "image/png", "schets.png");
    expect(first).toMatchObject({ ok: true });
    /* A file that is not what it claims to be fails on its own... */
    const failed = await upload(new TextEncoder().encode("geen pdf"), "application/pdf", "offerte.pdf");
    expect(failed.ok).toBe(false);
    /* ...and the retry with the real file lands on the same request. */
    const retried = await upload(pdf, "application/pdf", "offerte.pdf");
    expect(retried).toMatchObject({ ok: true });
    own.attachment = first.ok ? first.attachment.id : "";

    const { count } = await service.from("customer_requests").select("id", { count: "exact", head: true }).eq("customer_id", A.customer);
    expect(count).toBe(1);

    expect(await setRequestStatus(own.request, "in_review")).toMatchObject({ ok: true });
    as(browser);
    const seen = await readPortalRequest(A.customer, own.request);
    expect(seen.status).toBe("in_review");
    expect(seen.attachments.map((attachment) => attachment.fileName).sort()).toEqual(["offerte.pdf", "schets.png"]);

    const download = await attachmentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ attachmentId: own.attachment }) });
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(png);
  }, 120_000);

  it("D. receives the quote made for the request, downloads its exact PDF and accepts it; a second quote is rejected", async () => {
    own.quote = await concept("quotes", A.customer, 150000);
    const sent = await sendQuoteToCustomer(own.quote);
    expect(sent.ok).toBe(true);
    /* A quote is general correspondence: it went to the contact address, not the billing address. */
    expect(sent.ok && sent.value.recipient).toBe(A.contact);
    expect((await linkRequest(own.request, { projectId: null, quoteId: own.quote })).ok).toBe(true);

    as(browser);
    const quoteRow = (await service.from("quotes").select("*").eq("id", own.quote).single()).data!;
    const pdf = await documentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ kind: "quote", id: own.quote }) });
    expect(pdf.status).toBe(200);
    expect(await sha256(pdf)).toBe(quoteRow.document_sha256);

    const decision = await readPortalQuoteDecision(A.customer, own.quote);
    expect(decision).toMatchObject({ state: "open", documentSha256: quoteRow.document_sha256 });
    const accepted = await decideQuoteAction({ status: "idle" }, form({ customerId: A.customer, quoteId: own.quote, decision: "accepted", documentSha256: decision.documentSha256!, confirmTerms: "on" }));
    expect(accepted).toEqual({ status: "decided", decision: "accepted", already: false });

    const record = (await service.from("quote_decisions").select("*").eq("quote_id", own.quote).single()).data!;
    expect(record).toMatchObject({
      decision: "accepted",
      source: "portal",
      actor_user_id: A.userId,
      actor_email: A.member,
      terms_confirmed: true,
      quote_document_sha256: quoteRow.document_sha256,
      terms_edition: quoteRow.terms_edition,
      terms_published_on: quoteRow.terms_published_on,
    });
    expect((await service.from("quote_decisions").update({ decision: "rejected" }).eq("id", record.id)).error).not.toBeNull();

    as(browser);
    const request = await readPortalRequest(A.customer, own.request);
    expect(request.quote?.id).toBe(own.quote);
    expect(portalQuoteState(await readPortalQuote(A.customer, own.quote), today)).toBe("accepted");
    expect(request.status).toBe("in_review");

    own.rejectedQuote = await concept("quotes", A.customer, 90000);
    expect((await sendQuoteToCustomer(own.rejectedQuote)).ok).toBe(true);
    as(browser);
    const second = await readPortalQuoteDecision(A.customer, own.rejectedQuote);
    const rejected = await decideQuoteAction({ status: "idle" }, form({ customerId: A.customer, quoteId: own.rejectedQuote, decision: "rejected", documentSha256: second.documentSha256!, rejectionReason: "We wachten tot volgend jaar." }));
    expect(rejected).toMatchObject({ status: "decided", decision: "rejected" });
    expect((await readPortalQuoteDecision(A.customer, own.rejectedQuote)).decision).toMatchObject({ kind: "rejected", rejectionReason: "We wachten tot volgend jaar." });
  }, 120_000);

  it("E-F. sees an invoice with a credit note and a part payment, pays the rest through Mollie, and sees it paid", async () => {
    own.invoice = await concept("invoices", A.customer, 100000);
    expect((await finalizeInvoice(own.invoice)).ok).toBe(true);
    const sentInvoice = await sendInvoiceToCustomer(own.invoice);
    expect(sentInvoice.ok).toBe(true);
    /* Financial mail goes to the billing address the customer set. */
    expect(sentInvoice.ok && sentInvoice.value.recipient).toBe(A.billing);
    const credit = await createManualCreditNote(own.invoice, { reason: "Korting", issueDate: today, lines: [{ description: "Korting", quantityHundredths: 100, unitPriceCents: 10000, vatRate: 21 }] });
    expect(credit.ok).toBe(true);
    expect((await recordManualPayment(own.invoice, { amountCents: 21000, paidOn: today, note: "" })).ok).toBe(true);

    as(browser);
    const before = portalInvoiceView(await readPortalInvoice(A.customer, own.invoice), today);
    /* 1.210,00 gross - 121,00 credited - 210,00 paid. */
    expect(before.openCents).toBe(87900);
    expect(before.state).toBe("partially_paid");
    expect(invoicePaymentBlock(before, await readPortalPaymentContext(A.customer))).toBeUndefined();
    const invoicePdf = await documentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ kind: "invoice", id: own.invoice }) });
    expect(invoicePdf.status).toBe(200);

    resetRateLimits();
    const checkout = await redirectOf(() => payInvoiceAction({}, form({ invoiceId: own.invoice })));
    expect(checkout).toMatch(/^https:\/\/mollie\.test\/pay\//);
    const link = payAtMollie(checkout);
    expect(link.amountCents).toBe(87900);

    expect(await webhook(link.id)).toBe(200);
    /* Mollie delivers again; nothing moves twice. */
    expect(await webhook(link.id)).toBe(200);
    const payments = (await service.from("payments").select("amount_cents, status").eq("invoice_id", own.invoice)).data!;
    expect(payments.map((payment) => payment.amount_cents).sort((a, b) => a - b)).toEqual([21000, 87900]);

    as(browser);
    const after = portalInvoiceView(await readPortalInvoice(A.customer, own.invoice), today);
    expect(after.openCents).toBe(0);
    expect(after.state).toBe("paid");
    expect(invoicePaymentBlock(after, await readPortalPaymentContext(A.customer))).toBe("nothing_due");
    resetRateLimits();
    expect(await payInvoiceAction({}, form({ invoiceId: own.invoice }))).toEqual({ error: "Op deze factuur staat niets meer open." });
  }, 120_000);

  it("G. activates direct debit with EUR 0.01, which pays no invoice and starts no term", async () => {
    const created = await admin.rpc("create_recurring_service", {
      p_customer_id: A.customer, p_name: "Websitebeheer", p_description: "", p_amount_cents: 2500, p_vat_rate: 21,
      p_starts_on: "2026-11-01", p_status: "awaiting_mandate", p_effective_from: "2026-11-01",
      p_terms_edition: "2026", p_terms_published_on: "2026-09-14", p_note: "",
    });
    if (created.error) throw new Error(created.error.message);
    own.service = created.data as string;
    const serviceBefore = (await service.from("recurring_services").select("*").eq("id", own.service).single()).data!;
    const paymentsBefore = (await service.from("payments").select("id").eq("customer_id", A.customer)).data!.length;
    const invoiceBefore = (await service.from("invoices").select("status, updated_at").eq("id", own.invoice).single()).data!;

    as(browser);
    expect((await readPortalPaymentContext(A.customer)).directDebit).not.toBe("active");
    resetRateLimits();
    const checkout = await redirectOf(() => activateDirectDebitAction());
    const link = [...mollie.links.values()].find((candidate) => candidate.href === checkout)!;
    expect(link).toMatchObject({ amountCents: 1, sequenceType: "first" });

    const providerCustomer = link.customerId!;
    mollie.mandates.set(providerCustomer, [{ id: `mdt_v1${runId}`, status: "valid", method: "directdebit" }]);
    payAtMollie(checkout, { customerId: providerCustomer, mandateId: `mdt_v1${runId}` });
    expect(await webhook(link.id)).toBe(200);

    as(browser);
    expect((await readPortalPaymentContext(A.customer)).directDebit).toBe("active");
    resetRateLimits();
    expect(await activateDirectDebitAction()).toEqual({ error: "Uw automatische incasso is al actief." });

    /* The cent bought a mandate: no invoice payment, no invoice change, the service untouched until YM Creations starts it. */
    expect((await service.from("payments").select("id").eq("customer_id", A.customer)).data!.length).toBe(paymentsBefore);
    expect((await service.from("invoices").select("status, updated_at").eq("id", own.invoice).single()).data).toEqual(invoiceBefore);
    expect((await service.from("recurring_services").select("*").eq("id", own.service).single()).data).toEqual(serviceBefore);
    const services = await readPortalServices(A.customer);
    expect(services.find((item) => item.id === own.service)?.status).toBe("awaiting_mandate");
  }, 120_000);
});

describe.runIf(local).sequential("another customer reaching for all of it", () => {
  let memberB: Db;
  let memberAB: Db;

  beforeAll(async () => {
    memberB = await onboard(B.customer, B.member);
    memberAB = await onboard(B.customer, AB.member);
    const second = await invitePortalMember(A.customer, AB.member);
    expect(second.ok).toBe(true);
    const { data: project } = await service.from("projects").insert({ customer_id: A.customer, name: "Alfa website", status: "active", notes: "" }).select("id").single();
    own.project = project!.id;
    own.decisionQuote = own.quote;
  }, 120_000);

  it("a member of B only: every id of A, named under B or under A, is refused", async () => {
    as(memberB, B.customer);
    for (const read of [
      () => readPortalRequest(B.customer, own.request),
      () => readPortalRequest(A.customer, own.request),
      () => readPortalQuote(B.customer, own.quote),
      () => readPortalQuoteDecision(B.customer, own.decisionQuote),
      () => readPortalQuoteDecision(A.customer, own.decisionQuote),
      () => readPortalInvoice(B.customer, own.invoice),
      () => readPortalInvoice(A.customer, own.invoice),
      () => readPortalProfile(A.customer),
      () => readPortalServices(A.customer),
      () => readPortalPaymentContext(A.customer),
    ]) {
      expect(await denied(read())).toBe(true);
    }
    for (const [kind, id] of [["quote", own.quote], ["invoice", own.invoice]] as const) {
      expect((await documentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ kind, id }) })).status).toBe(404);
    }
    expect((await attachmentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ attachmentId: own.attachment }) })).status).toBe(404);

    /* Writes: the session acts for B; A's ids get nothing. */
    resetRateLimits();
    expect(await payInvoiceAction({}, form({ invoiceId: own.invoice }))).toMatchObject({ error: expect.any(String) });
    const quote = (await service.from("quotes").select("document_sha256").eq("id", own.rejectedQuote).single()).data!;
    expect(await decideQuoteAction({ status: "idle" }, form({ customerId: B.customer, quoteId: own.rejectedQuote, decision: "accepted", documentSha256: quote.document_sha256!, confirmTerms: "on" }))).toMatchObject({ status: "error" });
    expect((await memberB.rpc("portal_decide_quote", { p_customer_id: A.customer, p_quote_id: own.rejectedQuote, p_decision: "accepted", p_expected_sha256: quote.document_sha256!, p_terms_confirmed: true, p_rejection_reason: null })).error?.code).toBe("42501");
    expect((await memberB.rpc("portal_reserve_request_upload", { p_customer_id: A.customer, p_request_id: own.request })).error?.code).toBe("42501");
    expect((await memberB.rpc("portal_reserve_request_upload", { p_customer_id: B.customer, p_request_id: own.request })).error).not.toBeNull();
    const profile = await saveProfileAction({ status: "idle" }, form({ customerId: A.customer, version: "2026-01-01T00:00:00Z", companyName: "Overgenomen", contactName: "X", email: mail("x"), billingEmail: "", phone: "", street: "S", postalCode: "1", city: "C", country: "Nederland", kvkNumber: "", vatNumber: "" }));
    expect(profile.status).toBe("stale_customer");

    /* Nothing of A moved. */
    expect((await service.from("quote_decisions").select("id").eq("quote_id", own.rejectedQuote)).data!.length).toBe(1);
    expect((await service.from("customers").select("company_name").eq("id", A.customer).single()).data!.company_name).toBe(`Alfa ${stamp}`);
  }, 120_000);

  it("a member of A and B acting for B: A's ids through B are refused, a stale form for A is refused, a forged cookie falls back", async () => {
    as(memberAB, B.customer);
    expect(await denied(readPortalInvoice(B.customer, own.invoice))).toBe(true);
    expect(await denied(readPortalRequest(B.customer, own.request))).toBe(true);
    expect(await denied(readPortalQuote(B.customer, own.quote))).toBe(true);
    expect((await documentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ kind: "invoice", id: own.invoice }) })).status).toBe(404);
    expect((await attachmentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ attachmentId: own.attachment }) })).status).toBe(404);
    resetRateLimits();
    expect(await payInvoiceAction({}, form({ invoiceId: own.invoice }))).toMatchObject({ error: expect.any(String) });
    /* A page left open from A, submitted while the session acts for B. */
    expect((await decideQuoteAction({ status: "idle" }, form({ customerId: A.customer, quoteId: own.rejectedQuote, decision: "accepted", documentSha256: "a".repeat(64), confirmTerms: "on" }))).status).toBe("stale_customer");
    const { data: linkable } = await memberAB.rpc("portal_request", { p_customer_id: B.customer, p_request_id: own.request });
    expect(linkable ?? []).toHaveLength(0);

    /* A cookie naming a customer this user has no membership of is not obeyed: the session falls back to one of their own. */
    as(memberAB, crypto.randomUUID());
    expect(await denied(readPortalProfile(crypto.randomUUID()))).toBe(true);
    as(memberAB, A.customer);
    expect((await readPortalInvoice(A.customer, own.invoice)).id).toBe(own.invoice);
  }, 120_000);

  it("revoked, a member without a membership, and an admin: nothing", async () => {
    const memberships = (await service.from("customer_users").select("id, user_id").eq("customer_id", A.customer)).data!;
    const abMembership = memberships.find((row) => row.user_id !== A.userId)!;
    expect((await revokePortalMember(A.customer, abMembership.id)).ok).toBe(true);
    as(memberAB, A.customer);
    expect(await denied(readPortalInvoice(A.customer, own.invoice))).toBe(true);
    expect((await documentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ kind: "quote", id: own.quote }) })).status).toBe(404);

    const bare = await service.auth.admin.createUser({ email: mail("bare"), password, email_confirm: true });
    const bareClient = await signedIn(mail("bare"));
    as(bareClient);
    expect(await denied(readPortalInvoice(A.customer, own.invoice))).toBe(true);
    await expect(payInvoiceAction({}, form({ invoiceId: own.invoice }))).rejects.toThrow("redirect:/portaal/geen-toegang");
    await service.auth.admin.deleteUser(bare.data.user!.id);

    as(admin);
    expect(await denied(readPortalInvoice(A.customer, own.invoice))).toBe(true);
    expect(await denied(readPortalRequest(A.customer, own.request))).toBe(true);
  }, 120_000);
});
